import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createFakePluginHost } from '@get-bb/plugin-sdk/testing';
import plugin from '../dist/server.js';
import { editableForRange } from '../note-selection.ts';
import { noteAutosave, noteTitle, isNoteDraft } from '../note-autosave.ts';
import { parseMarkdownToBlocks, serializeBlocksToMarkdown, detectMarkdownPrefix, moveNoteBlock, formatNoteBlock } from '../vendor/note-blocks.ts';

const input = (content = '') => ({ id: randomUUID(), revision: 0, content, theme: 'default', pinned: false });
function host() { const fake = createFakePluginHost({ pluginId: 'vv-raycast', sdk: { projects: { list: async () => [] } } }); plugin(fake.bb); return fake.harness; }
const list = (h, query = '', deleted = false, offset = 0) => h.behavior.callRpc('noteList', { query, deleted, offset });

test('notes preserve empty edits, search body text literally and recover deleted content', async () => {
  const h = host();
  try {
    const draft = input('# Meeting\nÜber research and %_ markers');
    const saved = await h.behavior.callRpc('noteSave', draft);
    assert.equal(saved.title, 'Meeting'); assert.equal(saved.revision, 1);
    assert.equal((await h.behavior.callRpc('noteSave', draft)).revision, 1);
    assert.equal((await list(h, 'über')).notes[0].id, saved.id);
    assert.equal((await list(h, '%_')).notes.length, 1);
    assert.equal((await list(h, "'; DROP TABLE notes;--")).notes.length, 0);
    assert.equal(Object.hasOwn((await list(h)).notes[0], 'content'), false);
    await assert.rejects(h.behavior.callRpc('noteSave', { ...draft, content: 'stale overwrite' }), /changed elsewhere/);
    const cleared = await h.behavior.callRpc('noteSave', { ...saved, content: '' });
    assert.equal(cleared.content, ''); assert.equal(cleared.title, 'Untitled');
    const deleted = await h.behavior.callRpc('noteAction', { id: saved.id, revision: cleared.revision, action: 'delete' });
    assert.ok(deleted.deletedAt); assert.equal((await list(h)).notes.length, 0);
    assert.equal((await list(h, '', true)).notes[0].id, saved.id);
    await assert.rejects(h.behavior.callRpc('noteSave', { ...deleted, content: 'must not resurrect' }), /Recently Deleted/);
    await assert.rejects(h.behavior.callRpc('noteAction', { id: saved.id, revision: cleared.revision, action: 'restore' }), /changed elsewhere/);
    const restored = await h.behavior.callRpc('noteAction', { id: saved.id, revision: deleted.revision, action: 'restore' });
    assert.equal(restored.deletedAt, null); assert.equal(restored.content, '');
    assert.equal(h.inspection.sdk.callsTo('threads.spawn').length, 0);
  } finally { await h.lifecycle.dispose(); }
});

test('note list pages do not expose whole bodies and pins lead the sort', async () => {
  const h = host();
  try {
    const first = await h.behavior.callRpc('noteSave', input('Pinned note'));
    for (let n = 0; n < 101; n++) await h.behavior.callRpc('noteSave', input(`Note ${n}`));
    await h.behavior.callRpc('noteAction', { id: first.id, revision: first.revision, action: 'pin' });
    const a = await list(h), b = await list(h, '', false, 100);
    assert.equal(a.notes.length, 100); assert.equal(a.more, true); assert.equal(a.notes[0].id, first.id);
    assert.equal(b.notes.length, 2); assert.equal(b.more, false);
    assert.equal(new Set([...a.notes, ...b.notes].map(note => note.id)).size, 102);
    assert.equal(JSON.parse((await h.behavior.runCli(['notes', 'Pinned'])).stdout).notes[0].id, first.id);
  } finally { await h.lifecycle.dispose(); }
});

test('autosave serializes edits made during an in-flight save and rebases only its revision', async () => {
  const writes = [], kept = []; let release;
  const session = noteAutosave(input(), false, value => {
    writes.push(value);
    return writes.length === 1 ? new Promise(resolve => { release = () => resolve({ ...value, revision: 1 }); }) : Promise.resolve({ ...value, revision: value.revision + 1 });
  }, value => kept.push(value), () => {});
  session.update({ content: 'first' });
  const saving = session.flush();
  session.update({ content: 'latest', pinned: true });
  const concurrent = session.flush();
  assert.equal(writes.length, 1); assert.equal(kept.at(-1).content, 'latest');
  release(); await Promise.all([saving, concurrent]);
  assert.equal(writes.length, 2); assert.equal(writes[1].revision, 1); assert.equal(writes[1].content, 'latest');
  assert.equal(session.value.revision, 2); assert.equal(session.value.pinned, true); assert.equal(session.dirty, false);
  assert.equal(kept.at(-1).dirty, false);
});

test('uncertain note save is retained and explicit retry reconciles the same ID without duplicates', async () => {
  const h = host(); let fail = true, calls = 0; const kept = [];
  try {
    const session = noteAutosave(input(), false, async value => {
      calls++; const saved = await h.behavior.callRpc('noteSave', value);
      if (fail) { fail = false; throw new Error('response lost'); } return saved;
    }, value => kept.push(value), () => {});
    session.update({ content: 'retained text' });
    await assert.rejects(session.flush(), /response lost/);
    assert.equal(session.dirty, true); assert.equal(session.recoverable, true);
    await assert.rejects(session.flush(), /response lost/); assert.equal(calls, 1);
    await session.flush(true);
    assert.equal(calls, 2); assert.equal(session.value.revision, 1); assert.equal((await list(h)).notes.length, 1);
    assert.equal(kept.at(-1).content, 'retained text');
  } finally { await h.lifecycle.dispose(); }
});

test('empty scratch notes do not create records and storage failure does not claim recovery', async () => {
  let calls = 0;
  const session = noteAutosave(input(), false, async value => { calls++; return { ...value, revision: 1 }; }, () => { throw new Error('quota'); }, () => {});
  await session.flush(); assert.equal(calls, 0);
  session.update({ content: 'only in this window' }); assert.equal(session.recoverable, false);
  await session.flush(); assert.equal(session.recoverable, true); assert.equal(session.dirty, false);
  assert.equal(noteTitle('- [x] **Finish** [notes](https://example.com)'), 'Finish notes');
  assert.equal(isNoteDraft({ ...input('x'.repeat(100001)), dirty: true }), true);
  assert.equal(isNoteDraft({ ...input(), content: [], dirty: true }), false);
});

test('donor note blocks retain fenced language/text and support bounded reordering', () => {
  const source = '# Meeting\n1. First\n2. Second\n- [x] Done\n> Quote\n~~~~js\nconst x = "```";\n~~~~\n';
  const blocks = parseMarkdownToBlocks(source);
  assert.equal(serializeBlocksToMarkdown(blocks), source);
  assert.equal(blocks.find(block => block.type === 'code').language, 'js');
  const moved = moveNoteBlock(blocks, 0, 1);
  assert.equal(moved[1].content, 'Meeting'); assert.equal(blocks[0].content, 'Meeting');
  assert.equal(moveNoteBlock(blocks, 0, -1), blocks);
  assert.deepEqual(detectMarkdownPrefix('``` '), { type: 'code', content: '' });
  assert.deepEqual(detectMarkdownPrefix('- [x] '), { type: 'checkbox', content: '', checked: true });
});

test('note format controls convert the current block and preserve text when inserting a divider', () => {
  const blocks = parseMarkdownToBlocks('First\nSecond');
  const heading = formatNoteBlock(blocks, blocks[0].id, 'h1');
  assert.equal(heading.blocks[0].type, 'h1'); assert.equal(heading.blocks[0].content, 'First');
  const divider = formatNoteBlock(blocks, blocks[0].id, 'divider');
  assert.deepEqual(divider.blocks.map(block => block.type), ['paragraph', 'divider', 'paragraph', 'paragraph']);
  assert.deepEqual(divider.blocks.map(block => block.content), ['First', '', '', 'Second']);
  assert.equal(divider.focusId, divider.blocks[2].id);
});

test('inline formatting refuses selections crossing blocks or outside the note', () => {
  const a = { nodeType: 1, closest() { return this; } }, b = { nodeType: 1, closest() { return this; } };
  const root = { contains: element => element === a || element === b };
  const text = parentElement => ({ nodeType: 3, parentElement });
  assert.equal(editableForRange({ startContainer: text(a), endContainer: text(a) }, root), a);
  assert.equal(editableForRange({ startContainer: a, endContainer: text(b) }, root), null);
  assert.equal(editableForRange({ startContainer: text(a), endContainer: text(a) }, { contains: () => false }), null);
});
