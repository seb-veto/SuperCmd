import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuickIntent, submitQuickIntent } from '../quick-submit.ts';

const composer = changes => ({ scope: { kind: 'new-thread', projectId: 'personal' }, text: 'Question', isSubmitting: false, isSubmittingBlocked: false, submit: async () => {}, ...changes });
test('Quick AI submits the owned seeded draft once after native readiness, including repeated effects', () => {
  const calls = [], errors = [];
  const intent = createQuickIntent('draft-id', 'Question', error => errors.push(error));
  assert.equal(submitQuickIntent(intent, composer({ isSubmittingBlocked: true })), false);
  assert.equal(submitQuickIntent(intent, composer({ text: '' })), false);
  assert.equal(submitQuickIntent(intent, composer({ scope: { kind: 'thread', threadId: 'other' } })), false);
  const ready = composer({ submit: async options => calls.push(options) });
  assert.equal(submitQuickIntent(intent, ready), true);
  assert.equal(submitQuickIntent(intent, ready), false);
  assert.deepEqual(calls, [{ experimental_data: { raycastQuickIntent: 'draft-id' } }]);
  assert.deepEqual(errors, []);
});
test('empty Tab, unrelated composers, cancelled intent and failed submission never create automatic retries', async () => {
  const calls = [], errors = [];
  const ready = composer({ submit: async () => calls.push('send') });
  assert.equal(createQuickIntent('blank', '  ', () => {}), null);
  assert.equal(submitQuickIntent(null, ready), false);
  const cancelled = createQuickIntent('cancelled', 'Question', () => {}); cancelled.cancel();
  assert.equal(submitQuickIntent(cancelled, ready), false);
  const failed = createQuickIntent('failed', 'Question', error => errors.push(error.message));
  assert.equal(submitQuickIntent(failed, composer({ submit: async () => { throw new Error('Unconfirmed'); } })), true);
  await Promise.resolve();
  assert.equal(submitQuickIntent(failed, ready), false);
  assert.deepEqual(errors, ['Unconfirmed']);
  assert.deepEqual(calls, []);
});
