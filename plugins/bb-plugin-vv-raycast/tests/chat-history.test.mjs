import test from 'node:test';
import assert from 'node:assert/strict';
import { chatHistory } from '../chat-history.ts';

const now = new Date(2026, 9, 28, 12);
const at = (day, month = 9, year = 2026) => new Date(year, month, day, 12).getTime();
const chat = (id, date, extra = {}) => ({ id, title: id, createdAt: date, activityAt: 0, pinned: false, archived: false, ...extra });
const rows = groups => groups.flatMap(group => group.buckets.flatMap(bucket => bucket.chats));

test('history uses native activity for chronological groups without changing inputs', () => {
  const chats = [chat('old', at(5, 7)), chat('last', at(22)), chat('week', at(26)), chat('yesterday', at(27)), chat('active', at(2), { activityAt: at(28) }), chat('past-year', at(2, 9, 2025)), chat('undated', 0)];
  const original = structuredClone(chats);
  const groups = chatHistory(chats, [], '', false, now);
  assert.deepEqual(groups[0].buckets.map(bucket => bucket.label), ['Today', 'Yesterday', 'This Week', 'Last Week', 'August', 'October 2025', 'Older']);
  assert.deepEqual(rows(groups).map(chat => chat.id), ['active', 'yesterday', 'week', 'last', 'old', 'past-year', 'undated']);
  assert.deepEqual(chats, original);
});

test('pins appear once above alphabetic native projects and unknown projects stay reachable', () => {
  const chats = [chat('recent', at(28)), chat('zebra', at(27), { projectId: 'z' }), chat('alpha', at(26), { projectId: 'a' }), chat('pin', at(25), { pinned: true, projectId: 'a' }), chat('unknown', at(24), { projectId: 'gone' })];
  const groups = chatHistory(chats, [{ id: 'z', name: 'Zebra' }, { id: 'unused', name: 'Unused' }, { id: 'a', name: 'Alpha' }], '', false, now);
  assert.deepEqual(groups.map(group => group.label), ['Pinned', 'Alpha', 'Zebra', 'Recent']);
  assert.deepEqual(rows(groups).map(chat => chat.id), ['pin', 'alpha', 'zebra', 'recent', 'unknown']);
  assert.equal(new Set(rows(groups).map(chat => chat.id)).size, chats.length);
});

test('title filtering and archive mode preserve the same rendered shortcut ordering', () => {
  const chats = [chat('active', at(28)), chat('archive', at(26), { title: 'Archived QA', archived: true }), chat('pinned', at(25), { title: 'Pinned QA', archived: true, pinned: true })];
  assert.deepEqual(rows(chatHistory(chats, [], '  qA  ', true, now)).map(chat => chat.id), ['pinned', 'archive']);
  assert.deepEqual(chatHistory(chats, [], 'QA', false, now), []);
  assert.deepEqual(rows(chatHistory(chats, [], '', false, now)).map(chat => chat.id), ['active']);
});

test('local calendar boundaries survive DST and crossing a month or year', () => {
  const afterDST = new Date(2026, 10, 2, 0, 30);
  const yesterday = new Date(2026, 10, 1, 0, 15).getTime();
  assert.equal(chatHistory([chat('DST', yesterday)], [], '', false, afterDST)[0].buckets[0].label, 'Yesterday');
  const january = new Date(2027, 0, 4, 12);
  assert.equal(chatHistory([chat('December', at(31, 11))], [], '', false, january)[0].buckets[0].label, 'Last Week');
  const future = chatHistory([chat('clock-skew', at(1, 10))], [], '', false, now)[0].buckets[0].label;
  assert.equal(future, 'November 1, 2026');
});
