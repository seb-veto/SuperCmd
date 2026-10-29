import test from 'node:test';
import assert from 'node:assert/strict';
import { createFakePluginHost } from '@get-bb/plugin-sdk/testing';
import { resolveBrowserUrl, requireBrowserUrl } from '../browser-url.ts';
import { rankRootCommands } from '../root-search.ts';
import plugin from '../dist/server.js';
import host from '../dist/host.js';

test('Donor URL detection infers HTTPS for domains, ports and IPs and normalizes explicit HTTP', () => {
  for (const [input, expected] of [['example.com/docs?q=a#b', 'https://example.com/docs?q=a#b'], ['HTTP://Example.COM', 'http://example.com/'], ['//example.com/docs', 'https://example.com/docs'], ['localhost:3000/path', 'https://localhost:3000/path'], ['127.0.0.1:8080', 'https://127.0.0.1:8080/'], ['[::1]:3000', 'https://[::1]:3000/'], ['  example.com  ', 'https://example.com/']]) assert.equal(requireBrowserUrl(input), expected);
});

test('URL detection does not turn text, files, credentials, unsupported schemes or version numbers into navigation', () => {
  for (const input of ['', 'find my document', 'user@example.com', '/Users/example/file', '~/file.txt', './file.txt', '1.2.3', '999.1.1.1', 'javascript:alert(1)', 'data:text/html,test', 'file:///Users/example/file', 'shell://run', 'ftp://example.com', 'https://user:pass@example.com', 'https://user@example.com', 'https://example.com\\@evil.test', 'https://exa\nmple.com', 'https://example.com/a b', 'https://example.com/' + 'a'.repeat(4096)]) {
    assert.equal(resolveBrowserUrl(input), null, input);
    assert.throws(() => requireBrowserUrl(input), /HTTP or HTTPS/);
  }
});

test('Explicit URL dispatch validates on server and host and never creates a saved object or model turn', async () => {
  const calls = [];
  const fake = createFakePluginHost({ pluginId: 'vv-raycast', experimental_callHostRpc: async input => { calls.push(input); return { opened: true }; }, sdk: { system: { config: async () => ({ primaryHostId: 'url-test-host' }) }, projects: { list: async () => [] } } });
  plugin(fake.bb); const h = fake.harness;
  try {
    await assert.rejects(h.behavior.callRpc('openUrl', { input: 'javascript:alert(1)' }), /HTTP or HTTPS/);
    assert.equal(calls.length, 0);
    assert.deepEqual(await h.behavior.callRpc('openUrl', { input: 'example.com/path?q=%24%28touch%20no%29' }), { opened: true });
    const dispatch = h.inspection.experimental_hostRpcCalls[0];
    assert.equal(dispatch.method, 'openUrl'); assert.equal(dispatch.hostId, 'url-test-host');
    assert.deepEqual(dispatch.input, { input: 'https://example.com/path?q=%24%28touch%20no%29' });
    assert.equal(h.inspection.sdk.callsTo('threads.spawn').length, 0);
    assert.deepEqual((await h.behavior.callRpc('state', null)).quicklinks, []);
    assert.throws(() => host.handlers.openUrl({ input: 'file:///etc/passwd' }, { signal: new AbortController().signal }), /HTTP or HTTPS/);
  } finally { await h.lifecycle.dispose(); }
});

test('Transient normalized URL wins Root relevance without requiring a matching title substring', () => {
  const link = { id: 'open-url', title: 'Open https://example.com/', category: 'url', url: 'https://example.com/' };
  const items = [{ id: 'app', title: 'Example com', category: 'app' }, link];
  const preferences = { aliases: {}, usage: {} };
  assert.equal(rankRootCommands(items, 'example.com', preferences, ['app'])[0], link);
});
