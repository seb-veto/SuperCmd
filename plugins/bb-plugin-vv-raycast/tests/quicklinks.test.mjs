import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createFakePluginHost } from '@get-bb/plugin-sdk/testing';
import { isQuicklinkDraft, quicklinkFields, resolveQuicklink } from '../quicklinks.ts';
import { quicklinkOpener } from '../dist/host.js';
import plugin from '../dist/server.js';

test('Quicklink arguments preserve names, defaults and encoding without implicit context', () => {
  const template = 'https://example.com/{argument name="Org"}/search?q={argument name="Query" default="hello world"}&again={argument name="Query" default="hello world"}';
  assert.deepEqual(quicklinkFields(template), [{ key: 'org', name: 'Org' }, { key: 'query', name: 'Query', defaultValue: 'hello world' }]);
  assert.equal(resolveQuicklink(template, { org: 'a/b', query: 'x&admin=true #?' }), 'https://example.com/a%2Fb/search?q=x%26admin%3Dtrue%20%23%3F&again=x%26admin%3Dtrue%20%23%3F');
  assert.match(resolveQuicklink(template, { org: 'team' }), /hello%20world/);
  assert.equal(resolveQuicklink('https://example.com?q={argument}', { argument: 'ok' }), 'https://example.com/?q=ok');
  assert.equal(resolveQuicklink('~/Projects/{argument:Folder}', { folder: 'a b' }), '~/Projects/a b');
  assert.equal(resolveQuicklink('vscode://file/Users/test/{argument name="File"}', { file: 'notes.md' }), 'vscode://file/Users/test/notes.md');
  assert.throws(() => resolveQuicklink('https://example.com/{argument name="constructor"}', {}), /Enter constructor/);
});

test('Quicklinks fail closed for unsupported tokens, invalid destinations and malformed values', () => {
  for (const link of ['javascript:alert(1)', 'data:text/html,test', 'shell:echo', 'https://example.com/{clipboard}', 'https://example.com/{argument name="x"', '-a /Applications/App.app', 'https://example.com/\nnext', 'file://remote-host/private']) assert.throws(() => quicklinkFields(link));
  assert.throws(() => quicklinkFields('https://example.com/{argument name="x" default="a"}/{argument name="X" default="b"}'), /same default/);
  assert.throws(() => quicklinkFields(`https://example.com/${Array.from({ length: 11 }, (_, n) => `{argument name="q${n}"}`).join('/')}`), /ten arguments/);
  assert.throws(() => resolveQuicklink('https://example.com/{argument}', { argument: 'x\ny' }), /line break/);
  assert.throws(() => resolveQuicklink('https://example.com/{argument}', { argument: ' ' }), /Enter Argument/);
});

test('Quicklink CRUD survives reload, rejects stale writes/deletes and never spawns a model', async () => {
  const fake = createFakePluginHost({ pluginId: 'vv-raycast', experimental_callHostRpc: async () => ({ opened: true }), sdk: { system: { config: async () => ({ primaryHostId: 'quicklink-test-host' }) }, projects: { list: async () => [] } } });
  plugin(fake.bb); let harness = fake.harness;
  try {
    const draft = { id: randomUUID(), revision: 0, title: 'Search docs', link: 'https://example.com/?q={argument name="Query"}', tags: ['Work'] };
    const saved = await harness.behavior.callRpc('saveQuicklink', draft);
    assert.equal(saved.revision, 1);
    assert.deepEqual(await harness.behavior.callRpc('resolveQuicklink', { id: saved.id, revision: 1, values: { query: 'two words' } }), { target: 'https://example.com/?q=two%20words' });
    await assert.rejects(harness.behavior.callRpc('saveQuicklink', draft), /changed elsewhere/);
    await assert.rejects(harness.behavior.callRpc('deleteQuicklink', { id: saved.id, revision: 0 }), /changed elsewhere/);
    await assert.rejects(harness.behavior.callRpc('openQuicklink', { id: saved.id, revision: 0, values: { query: 'no' } }), /changed elsewhere/);
    await assert.rejects(harness.behavior.callRpc('resolveQuicklink', { id: saved.id, revision: 1 }), /Enter Query/);
    assert.equal(harness.inspection.experimental_hostRpcCalls.length, 0);
    assert.deepEqual(await harness.behavior.callRpc('openQuicklink', { id: saved.id, revision: 1, values: { query: 'two words' } }), { opened: true });
    assert.deepEqual(harness.inspection.experimental_hostRpcCalls.map(({ method, input, hostId }) => ({ method, input, hostId })), [{ method: 'openQuicklink', input: { target: 'https://example.com/?q=two%20words', applicationPath: '' }, hostId: 'quicklink-test-host' }]);
    harness = (await harness.lifecycle.reload(plugin)).harness;
    assert.deepEqual((await harness.behavior.callRpc('state', null)).quicklinks, [saved]);
    const edited = await harness.behavior.callRpc('saveQuicklink', { ...saved, pinned: true, hidden: true });
    assert.equal(edited.revision, 2);
    assert.deepEqual(JSON.parse((await harness.behavior.runCli(['quicklinks', '--json'])).stdout), [edited]);
    await assert.rejects(harness.behavior.callRpc('deleteQuicklink', { id: saved.id, revision: 1 }), /changed elsewhere/);
    assert.deepEqual(await harness.behavior.callRpc('deleteQuicklink', { id: saved.id, revision: 2 }), { deleted: true });
    assert.deepEqual((await harness.behavior.callRpc('state', null)).quicklinks, []);
    assert.equal(harness.inspection.sdk.callsTo('threads.spawn').length, 0);
  } finally { await harness.lifecycle.dispose(); }
});

test('host opener confines files, revalidates chosen apps and uses literal arguments', async () => {
  const root = await mkdtemp(join(tmpdir(), 'raycast-quicklinks-'));
  const home = join(root, 'home'), outside = join(root, 'outside');
  await mkdir(home); await mkdir(outside); await mkdir(join(home, 'Project folder'));
  await symlink(outside, join(home, 'escape'));
  const calls = [];
  const open = quicklinkOpener(home, async () => [{ path: '/Applications/Test.app' }], async (...args) => calls.push(args));
  try {
    await open('https://example.com/?q=%24%28touch%20no%29', '/Applications/Test.app');
    assert.deepEqual(calls[0].slice(0, 2), ['/usr/bin/open', ['-a', '/Applications/Test.app', '--', 'https://example.com/?q=%24%28touch%20no%29']]);
    await open('~/Project folder', '');
    assert.match(calls[1][1][1], /home\/Project folder$/);
    await assert.rejects(open('~/escape', ''), /remain inside Home/);
    await assert.rejects(open('https://example.com', '/tmp/not-installed.app'), /no longer installed/);
    await assert.rejects(open('javascript:alert(1)', ''), /scheme/);
    assert.equal(calls.length, 2);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('unfinished Quicklink drafts restore only with a valid structural shape', () => {
  const draft = { id: randomUUID(), revision: 0, title: '', link: '', icon: 'Link', applicationPath: '', tags: [], pinned: false, hidden: false };
  assert.equal(isQuicklinkDraft(draft), true);
  for (const value of [null, [], {}, { ...draft, tags: 'Work' }, { ...draft, icon: 'unknown' }, { ...draft, pinned: 'false' }, { ...draft, revision: -1 }, { ...draft, applicationPath: null }]) assert.equal(isQuicklinkDraft(value), false);
});
