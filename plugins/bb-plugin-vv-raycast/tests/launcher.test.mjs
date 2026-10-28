import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, realpath, rm, rename, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakePluginHost } from '@get-bb/plugin-sdk/testing';
import plugin from '../dist/server.js';
import { createFileSearch } from '../dist/host.js';

test('calculator handles arithmetic, percentages, functions and unit conversion without arbitrary execution', async () => {
  const host = createFakePluginHost({ pluginId: 'vv-raycast' }); plugin(host.bb);
  const calc = expression => host.harness.behavior.callRpc('calculate', { expression });
  try {
    for (const [expression, result] of [['0.1 + 0.2', '0.3'], ['52% of 900', '468'], ['20% off 80', '64'], ['square root of 625', '25'], ['2 power 10', '1024'], ['sin(pi/2)', '1'], ['10ft in m', '3.048 m']]) assert.equal((await calc(expression))?.result, result, expression);
    for (const expression of ['hello', '42', '1/0', 'sqrt(-1)', 'import("fs")', 'createUnit("boom")', 'a=2', '[1,2,3]', 'range(1,1e20)', '2;3', 'x.constructor', 'evaluate("2+2")', '999!']) assert.equal(await calc(expression), null, expression);
    assert.match((await host.harness.behavior.runCli(['calculate', '10ft in m', '--json'])).stdout, /3.048 m/);
    assert.equal(host.harness.inspection.sdk.callsTo('threads.spawn').length, 0);
    await assert.rejects(calc('1+'.repeat(121)));
  } finally { await host.harness.lifecycle.dispose(); }
});

test('file search respects ignore files, hidden/noisy paths, symlink boundaries and selection identity', { skip: process.platform !== 'darwin' }, async context => {
  const temporary = await realpath(await mkdtemp(join(tmpdir(), 'vv-raycast-files-test-')));
  const root = join(temporary, 'home'); await mkdir(root);
  const outside = join(temporary, 'outside.txt'); await writeFile(outside, 'outside');
  await mkdir(join(root, 'project')); await mkdir(join(root, 'project', 'node_modules'));
  await writeFile(join(root, '.gitignore'), 'ignored.txt\n');
  await writeFile(join(root, 'project', '.rayignore'), '*.secret\n');
  const paths = ['visible.txt', 'ignored.txt', '.hidden.txt', 'project/private.secret', 'project/node_modules/noise.txt'];
  for (const path of paths) await writeFile(join(root, path), path);
  await symlink(outside, join(root, 'escape.txt'));
  const candidates = [...paths, 'escape.txt'].map(path => join(root, path));
  const calls = [];
  const search = createFileSearch(root, async (file, args) => { calls.push({ file, args }); return { stdout: file.endsWith('mdfind') ? candidates.join('\0') + '\0' : '' }; });
  try {
    await assert.rejects(search.open('not-a-selection', false), /expired/);
    const result = await search.search('visible');
    assert.deepEqual(result.files.map(file => file.title), ['visible.txt']);
    assert.deepEqual((await search.search(join(root, 'visible.txt'))).files.map(file => file.title), ['visible.txt']);
    assert.deepEqual((await search.search(outside)).files, []);
    assert.equal(calls.filter(call => call.file.endsWith('/open')).length, 0);
    await search.open(result.files[0].id, true);
    assert.deepEqual(calls.at(-1), { file: '/usr/bin/open', args: ['-R', join(root, 'visible.txt')] });
    await writeFile(join(root, '.rayignore'), 'visible.txt\n');
    await assert.rejects(search.open(result.files[0].id, false), /now excluded/);
    await writeFile(join(root, '.rayignore'), '');
    await rename(join(root, 'visible.txt'), join(root, 'old.txt')); await writeFile(join(root, 'visible.txt'), 'replacement');
    await assert.rejects(search.open(result.files[0].id, false), /changed since selection/);
    assert.equal(calls.filter(call => call.file.endsWith('/open')).length, 1);
    await assert.rejects(search.search('bad\0query'));
    const fresh = (await search.search(join(root, 'visible.txt'))).files[0];
    context.mock.timers.enable({ apis: ['Date'], now: Date.now() });
    context.mock.timers.tick(300001);
    await assert.rejects(search.open(fresh.id, false), /expired/);
    context.mock.timers.reset();
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
