import test from 'node:test';
import assert from 'node:assert/strict';
import { readWindowMode, collapsedRoot, expandsCompactRoot } from '../window-mode.ts';

test('Window Mode validates stored settings and collapses only the empty Root surface', () => {
  assert.equal(readWindowMode(null), 'standard');
  assert.equal(readWindowMode('invalid'), 'standard');
  assert.equal(readWindowMode('compact'), 'compact');
  assert.equal(collapsedRoot('root', 'compact', '', false, false), true);
  for (const args of [['chat', 'compact', '', false, false], ['root', 'standard', '', false, false], ['root', 'compact', 'text', false, false], ['root', 'compact', ' ', false, false], ['root', 'compact', '', true, false], ['root', 'compact', '', false, true]]) assert.equal(collapsedRoot(...args), false);
});

test('Hidden-result keys reveal suggestions before a primary, secondary or numbered action can launch', () => {
  for (const key of ['Enter', 'ArrowDown', 'ArrowUp']) { assert.equal(expandsCompactRoot(key, false), true); assert.equal(expandsCompactRoot(key, true), true); }
  for (const key of ['1', '9']) { assert.equal(expandsCompactRoot(key, true), true); assert.equal(expandsCompactRoot(key, false), false); }
  for (const key of ['Tab', 'Escape', 'k', ',', 'Backspace']) assert.equal(expandsCompactRoot(key, false), false);
});
