import test from 'node:test';
import assert from 'node:assert/strict';
import host from '../dist/host.js';

test('macOS catalog excludes hidden bundles and refuses paths outside the catalog', { skip: process.platform !== 'darwin' }, async () => {
  const apps = await host.handlers.apps();
  assert.ok(apps.length > 0);
  assert.ok(apps.every(app => !app.title.startsWith('.')));
  await assert.rejects(host.handlers.openApp({ path: '/tmp/not-an-installed-app.app' }, { signal: new AbortController().signal }), /not in this host/);
  await assert.rejects(host.handlers.appIcon({ path: '/tmp/not-an-installed-app.app' }, { signal: new AbortController().signal }), /not in this host/);
});

test('reads an installed app icon without launching it', { skip: process.platform !== 'darwin' }, async context => {
  const apps = await host.handlers.apps();
  const app = apps.find(app => app.title === 'Raycast');
  if (!app) { context.skip('Raycast reference app is not installed'); return; }
  const icon = await host.handlers.appIcon({ path: app.path }, { signal: new AbortController().signal });
  assert.match(icon ?? '', /^data:image\/png;base64,/);
  assert.ok(Buffer.from(icon.split(',')[1], 'base64').length <= 100000);
});
