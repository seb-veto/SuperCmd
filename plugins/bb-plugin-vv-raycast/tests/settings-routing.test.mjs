import test from 'node:test';
import assert from 'node:assert/strict';
import { settingsRouting } from '../settings-routing.ts';

test('settings model catalog follows the owned thread or selected machine', () => {
  assert.deepEqual(settingsRouting('thread-env', { environment: { type: 'host', hostId: 'other' } }), { kind: 'environment', environmentId: 'thread-env' });
  assert.deepEqual(settingsRouting(undefined, { environment: { type: 'reuse', environmentId: 'reused-env' } }), { kind: 'environment', environmentId: 'reused-env' });
  assert.deepEqual(settingsRouting(undefined, { environment: { type: 'host', hostId: 'selected-host' } }), { kind: 'host', hostId: 'selected-host' });
  assert.deepEqual(settingsRouting(undefined, { environment: { type: 'provider', machine: { type: 'existing', hostId: 'provider-host' } } }), { kind: 'host', hostId: 'provider-host' });
  assert.equal(settingsRouting(undefined, null), undefined);
  assert.equal(settingsRouting(undefined, { environment: { type: 'project-default' } }), undefined);
});
