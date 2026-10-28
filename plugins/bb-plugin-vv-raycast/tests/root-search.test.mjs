import test from 'node:test';
import assert from 'node:assert/strict';
import { assignRootAlias, moveRootFavorite, rankRootCommands, readRootPreferences, recordRootLaunch, resetRootRanking, rootAlias, rootKey, selectedRootIndex } from '../root-search.ts';

const blank = () => ({ aliases: {}, usage: {} });
const command = (id, title, extra = {}) => ({ id, title, category: 'app', ...extra });
const ids = items => items.map(item => item.id);
const now = 1793230000000, DAY = 86400000;

test('Root fuzzy search matches abbreviated app names, accents and multiple fields without unrelated results', () => {
  const items = [command('m', 'Messages'), command('s', 'Slack'), command('v', 'Visual Studio Code'), command('c', 'Café'), command('n', 'Something', { subtitle: 'Notes Manager' })];
  assert.deepEqual(ids(rankRootCommands(items, 'msg', blank(), [])), ['m']);
  assert.deepEqual(ids(rankRootCommands(items, 'slk', blank(), [])), ['s']);
  assert.deepEqual(ids(rankRootCommands(items, 'vsc', blank(), [])), ['v']);
  assert.deepEqual(ids(rankRootCommands(items, 'cafe', blank(), [])), ['c']);
  assert.equal(rankRootCommands(items, 'zzq', blank(), []).length, 0);
  assert.deepEqual(ids(rankRootCommands(items, 'notes', blank(), [])), ['n']);
});

test('Exact alias and alias prefix beat title matches, while Favorites only dominate empty Root', () => {
  const items = [command('a', 'Messages'), command('b', 'msg'), command('c', 'msg-prefix')];
  const preferences = assignRootAlias(blank(), 'a', 'msg');
  assert.deepEqual(ids(rankRootCommands(items, 'msg', preferences, ['b'])), ['a', 'b', 'c']);
  assert.equal(rankRootCommands(items, 'ms', preferences, [])[0].id, 'a');
  assert.deepEqual(ids(rankRootCommands(items, '', preferences, ['c', 'a'])), ['c', 'a', 'b']);
  assert.equal(rankRootCommands(items, 'msg', blank(), ['c'])[0].id, 'b');
  assert.throws(() => assignRootAlias(preferences, 'b', 'MSG'), /another item/);
  assert.equal(rootAlias(assignRootAlias(preferences, 'b', 'TWO Words'), 'b'), 'two words');
  assert.throws(() => assignRootAlias(preferences, 'b', 'special!'), /letters/);
  assert.throws(() => assignRootAlias(preferences, 'b', '***'), /letters/);
  assert.equal(rootAlias(assignRootAlias(preferences, 'a', ''), 'a'), '');
  assert.equal(rootAlias(blank(), 'constructor'), '');
  const multi = assignRootAlias(blank(), 'a', 'go compose');
  assert.equal(rankRootCommands(items, 'go comp', multi, [])[0].id, 'a');
  assert.equal(rankRootCommands(items, 'gocom', multi, []).some(item => item.id === 'a'), false);
  assert.equal(rankRootCommands(items, 'go-comp', multi, []).some(item => item.id === 'a'), false);
  assert.equal(rootAlias(assignRootAlias(blank(), '__proto__', 'safe'), '__proto__'), 'safe');
  assert.equal(Object.getPrototypeOf(assignRootAlias(blank(), '__proto__', 'safe').aliases), Object.prototype);
});

test('Query-specific learned ranking changes comparable matches, decays once and resets without removing aliases', () => {
  const items = [command('a', 'Calendar'), command('b', 'Calculator')];
  let preferences = blank();
  for (let i = 0; i < 3; i++) preferences = recordRootLaunch(preferences, 'b', 'cal', now);
  assert.equal(rankRootCommands(items, 'cal', preferences, [], true, now)[0].id, 'b');
  assert.equal(rankRootCommands(items, '', preferences, [], true, now)[0].id, 'b');
  const snapshot = JSON.stringify(preferences);
  rankRootCommands(items, 'cal', preferences, [], true, now + 30 * DAY);
  assert.equal(JSON.stringify(preferences), snapshot, 'rendering must not compound decay or rewrite timestamps');
  const next = recordRootLaunch(preferences, 'b', 'cal', now + 30 * DAY);
  assert.equal(next.usage.b.score, 2.5);
  preferences = assignRootAlias(preferences, 'b', 'calc');
  const reset = resetRootRanking(preferences, 'b');
  assert.equal(reset.usage.b, undefined); assert.equal(reset.aliases.b, 'calc');
  assert.equal(rankRootCommands(items, 'cal', reset, [], true, now)[0].id, 'b', 'retained alias keeps its independent priority');
  assert.equal(rankRootCommands(items, 'cal', assignRootAlias(reset, 'b', ''), [], true, now)[0].id, 'a');
  assert.equal(rankRootCommands(items, 'cal', next, [], false, now)[0].id, 'a', 'learned Root order does not alter a command library');
});

test('Stored Root preferences are bounded and reject malformed values; recording prunes history without mutating input', () => {
  assert.deepEqual(readRootPreferences('{bad'), blank());
  assert.deepEqual(readRootPreferences('null'), blank());
  const malformed = readRootPreferences(JSON.stringify({ aliases: { a: 7, b: 'bad!', c: 'ok' }, usage: { a: { score: -1, at: now }, b: { score: 4, at: now, inputs: { bad: null, good: { score: 2, at: now } } } } }));
  assert.deepEqual(malformed.aliases, { c: 'ok' });
  assert.deepEqual(Object.keys(malformed.usage), ['b']);
  assert.deepEqual(Object.keys(malformed.usage.b.inputs), ['good']);
  const original = blank(); let preferences = original;
  for (let i = 0; i < 530; i++) preferences = recordRootLaunch(preferences, `id${i}`, `query${i}`, now + i);
  assert.equal(Object.keys(preferences.usage).length, 500);
  assert.equal(preferences.usage.id0, undefined);
  for (let i = 0; i < 30; i++) preferences = recordRootLaunch(preferences, 'id529', `query${i}`, now + 1000 + i);
  assert.equal(Object.keys(preferences.usage.id529.inputs).length, 24);
  assert.deepEqual(original, blank());
  assert.deepEqual(readRootPreferences(JSON.stringify(preferences)), preferences);
});

test('Favorites retain explicit order, paths retain file identity and async insertions retain selected item identity', () => {
  assert.deepEqual(moveRootFavorite(['a', 'b', 'c'], 'c', -1), ['a', 'c', 'b']);
  assert.deepEqual(moveRootFavorite(['a', 'b'], 'b', 1), ['a', 'b']);
  assert.deepEqual(moveRootFavorite(['a', 'b'], 'gone', 1), ['a', 'b']);
  const file = command('ephemeral-selection', 'readme', { category: 'file', file: { path: '/Users/example/readme' } });
  assert.equal(rootKey(file), 'file:/Users/example/readme');
  const selection = { query: 'ca', view: 'root', id: 'calendar' };
  assert.equal(selectedRootIndex(['calculator', 'file', 'calendar'], selection, 'ca', 'root'), 2);
  assert.equal(selectedRootIndex(['calculator'], selection, 'ca', 'root'), 0);
  assert.equal(selectedRootIndex(['calculator', 'calendar'], selection, 'calc', 'root'), 0);
  assert.equal(selectedRootIndex(['calculator', 'calendar'], selection, 'ca', 'files'), 0);
});

test('Authoritative body/file hits remain visible and calculator stays first without fuzzy-matching the result', () => {
  const items = [command('note', 'Meeting', { category: 'note' }), command('file', 'Document', { category: 'file' }), command('app', 'Unrelated')];
  assert.deepEqual(ids(rankRootCommands(items, 'body hit', blank(), [])), ['note', 'file']);
  const calculation = command('calculator', '4', { category: 'calculator' });
  assert.equal(rankRootCommands([...items, calculation], '2+2', blank(), [])[0].id, 'calculator');
});
