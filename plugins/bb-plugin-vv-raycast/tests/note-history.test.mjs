import test from 'node:test';
import assert from 'node:assert/strict';
import { noteHistory, noteHistoryFocus } from '../note-history.ts';

const block = (content = '', extra = {}) => ({ id: 'a', type: 'paragraph', content, ...extra });

test('Undo captures the first edit before a debounced checkpoint and retains it for Redo', () => {
  const initial = [block()], typed = [block('First edit')], history = noteHistory(initial);
  assert.equal(history.undo(initial), null);
  assert.deepEqual(history.undo(typed), initial);
  assert.deepEqual(history.redo(initial), typed);
  assert.deepEqual(history.undo(typed), initial);
});

test('Structural changes retain complete before/after blocks and metadata through Undo/Redo', () => {
  const before = [block('beforeafter', { type: 'code', language: 'js', fence: '~~~~' })];
  const after = [block('before', { type: 'code', language: 'js', fence: '~~~~' }), block('after', { id: 'b' })];
  const history = noteHistory(before); history.record(before); history.record(before);
  assert.deepEqual(history.undo(after), before);
  assert.deepEqual(history.redo(before), after);
  assert.deepEqual(history.undo(after), before);
  assert.equal(history.undo(before), null, 'duplicate checkpoints do not consume an undo step');
});

test('Typing after Undo replaces the redo branch without losing the new edit', () => {
  const initial = [block()], first = [block('first')], second = [block('second')], replacement = [block('replacement')];
  const history = noteHistory(initial); history.record(first); history.record(second);
  assert.deepEqual(history.undo(second), first);
  assert.equal(history.redo(replacement), null);
  assert.deepEqual(history.undo(replacement), first);
  assert.deepEqual(history.redo(first), replacement);
});

test('History owns snapshots, preserves task/list metadata and keeps a bounded undo window', () => {
  const initial = [block('task', { type: 'checkbox', checked: false })], history = noteHistory(initial);
  initial[0].content = 'mutated outside history';
  const checked = [block('task', { type: 'checkbox', checked: true })];
  const restored = history.undo(checked);
  assert.deepEqual(restored, [block('task', { type: 'checkbox', checked: false })]);
  restored[0].content = 'mutated returned frame';
  assert.deepEqual(history.redo([block('task', { type: 'checkbox', checked: false })]), checked);
  const bounded = noteHistory([block('0')]);
  for (let n = 1; n <= 150; n++) bounded.record([block(String(n))]);
  let current = [block('150')], count = 0, previous;
  while ((previous = bounded.undo(current))) { current = previous; count++; }
  assert.equal(count, 99); assert.equal(current[0].content, '51');
});

test('History restoration keeps an editable focus target when Undo removes the focused block', () => {
  const restored = [block('first'), block('second', { id: 'b' }), block('', { id: 'divider', type: 'divider' })];
  assert.deepEqual(noteHistoryFocus(restored, 'a'), { id: 'a', offset: 5 });
  assert.deepEqual(noteHistoryFocus(restored, 'removed-by-undo'), { id: 'b', offset: 6 });
  assert.deepEqual(noteHistoryFocus(restored, 'divider'), { id: 'b', offset: 6 });
  assert.equal(noteHistoryFocus([], 'missing'), null);
});
