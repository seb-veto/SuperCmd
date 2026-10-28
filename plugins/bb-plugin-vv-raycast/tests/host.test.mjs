import test from 'node:test';
import assert from 'node:assert/strict';
import host from '../dist/host.js';

test('macOS catalog excludes hidden bundles and refuses paths outside the catalog', { skip: process.platform !== 'darwin' }, async () => {
  const apps = await host.handlers.apps();
  assert.ok(apps.length > 0);
  assert.ok(apps.every(app => !app.title.startsWith('.')));
  await assert.rejects(host.handlers.openApp({ path: '/tmp/not-an-installed-app.app' }, { signal: new AbortController().signal }), /not in this host/);
});
