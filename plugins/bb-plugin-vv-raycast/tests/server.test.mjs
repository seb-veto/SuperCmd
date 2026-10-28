import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createFakePluginHost, makeThreadResponse } from '@get-bb/plugin-sdk/testing';
import plugin from '../dist/server.js';

function setup(spawn) {
  const host = createFakePluginHost({ pluginId: 'vv-raycast', sdk: { projects: { list: async () => [] }, threads: { spawn } } });
  plugin(host.bb);
  return host.harness;
}
const request = { projectId: 'personal', providerId: 'codex', model: 'gpt-6.1-sol', reasoningLevel: 'medium', permissionMode: 'auto', executionInputSources: {}, environment: { type: 'project-default' }, input: [{ type: 'text', text: 'Reply only with RAYCAST_OK', mentions: [] }] };
test('concurrent duplicate sends and reload preserve one real thread binding', async () => {
  let calls = 0;
  let harness = setup(async () => { calls++; return makeThreadResponse({ id: 'thread-once' }); });
  try {
    const input = { id: randomUUID(), request };
    const result = await Promise.all([harness.behavior.callRpc('start', input), harness.behavior.callRpc('start', input)]);
    assert.equal(calls, 1); assert.equal(result[0].threadId, 'thread-once'); assert.deepEqual(result[0], result[1]);
    harness = (await harness.lifecycle.reload(plugin)).harness;
    assert.equal((await harness.behavior.callRpc('start', input)).threadId, 'thread-once'); assert.equal(calls, 1);
    await assert.rejects(harness.behavior.callRpc('start', { ...input, request: { ...request, model: 'changed' } }), /different request/);
  } finally { await harness.lifecycle.dispose(); }
});
test('uncertain spawn failure survives reload without a second execution', async () => {
  let calls = 0;
  let harness = setup(async () => { calls++; throw new Error('connection lost after submission'); });
  try {
    const input = { id: randomUUID(), request };
    await assert.rejects(harness.behavior.callRpc('start', input), /unconfirmed/);
    harness = (await harness.lifecycle.reload(plugin)).harness;
    await assert.rejects(harness.behavior.callRpc('start', input), /unconfirmed/);
    assert.equal(calls, 1);
  } finally { await harness.lifecycle.dispose(); }
});
test('command revisions prevent stale writes and validate input', async () => {
  let harness = setup(async () => makeThreadResponse());
  try {
    const value = { id: randomUUID(), revision: 0, title: 'Summarize', prompt: 'Summarize {selection}' };
    const saved = await harness.behavior.callRpc('saveCommand', value);
    assert.equal(saved.revision, 1);
    await assert.rejects(harness.behavior.callRpc('saveCommand', { ...value, prompt: 'stale overwrite' }), /changed elsewhere/);
    await assert.rejects(harness.behavior.callRpc('saveCommand', { ...saved, title: '' }));
    harness = (await harness.lifecycle.reload(plugin)).harness;
    assert.deepEqual((await harness.behavior.callRpc('state', null)).commands, [saved]);
    assert.equal((await harness.behavior.runCli(['commands', '--json'])).exitCode, 0);
  } finally { await harness.lifecycle.dispose(); }
});

test('chat actions operate only on owned bindings and read native BB state', async () => {
  const native = makeThreadResponse({ id: 'owned-chat', title: 'Original title', pinnedAt: null, archivedAt: null });
  const harness = setup(async () => native);
  harness.sdk.stub('threads.get', async ({ threadId }) => { assert.equal(threadId, native.id); return native; });
  harness.sdk.stub('threads.defaultExecutionOptions', async () => ({ model: 'native-current-model', permissionMode: 'auto', reasoningLevel: 'medium', serviceTier: 'default', source: 'client/thread/start' }));
  harness.sdk.stub('threads.pin', async ({ threadId }) => { assert.equal(threadId, native.id); native.pinnedAt = 123; return { thread: native }; });
  harness.sdk.stub('threads.archive', async () => { native.archivedAt = 456; return { thread: native }; });
  harness.sdk.stub('threads.update', async ({ title }) => { native.title = title; return { thread: native }; });
  try {
    const id = randomUUID();
    await harness.behavior.callRpc('start', { id, request });
    await assert.rejects(harness.behavior.callRpc('chatAction', { id: randomUUID(), action: 'pin' }), /not in this Raycast workspace/);
    assert.equal(harness.inspection.sdk.callsTo('threads.pin').length, 0);
    assert.equal((await harness.behavior.callRpc('chatAction', { id, action: 'pin' })).pinned, true);
    assert.equal((await harness.behavior.callRpc('chatAction', { id, action: 'rename', title: 'Renamed' })).title, 'Renamed');
    assert.equal((await harness.behavior.callRpc('chatAction', { id, action: 'archive' })).archived, true);
    native.title = 'Changed from native BB';
    const state = await harness.behavior.callRpc('state', null);
    assert.equal(state.chats[0].title, native.title);
    assert.equal(state.chats[0].model, 'native-current-model');
    assert.equal(state.chats[0].pinned, true);
    assert.equal(state.chats[0].archived, true);
  } finally { await harness.lifecycle.dispose(); }
});
