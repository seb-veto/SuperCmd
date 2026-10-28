import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configureFileSearchIndex, stopFileSearchIndexing, rebuildFileSearchIndex, searchIndexedFiles, getFileSearchIndexStatus } from '../../../src/main/file-search-index.ts';

test('donor index finds exact names and paths, includes opted-in Documents, and excludes hidden/cache directories', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'vv-raycast-index-test-')));
  await mkdir(join(root, 'Projects', 'vv-raycast'), { recursive: true });
  await mkdir(join(root, 'Documents')); await mkdir(join(root, '.hidden')); await mkdir(join(root, 'node_modules'));
  await writeFile(join(root, 'Projects', 'vv-raycast', 'README.md'), 'synthetic index fixture');
  await writeFile(join(root, 'Documents', 'Raycast-QA.txt'), 'synthetic');
  await writeFile(join(root, '.hidden', 'Raycast-hidden.txt'), 'hidden');
  await writeFile(join(root, 'node_modules', 'Raycast-cache.txt'), 'cache');
  try {
    configureFileSearchIndex(root);
    await searchIndexedFiles('Raycast', { includeProtectedHomeRoots: true });
    await rebuildFileSearchIndex('test');
    assert.equal(getFileSearchIndexStatus().ready, true);
    const names = await searchIndexedFiles('vv-raycast');
    assert.ok(names.some(file => file.path === join(root, 'Projects', 'vv-raycast')));
    const paths = await searchIndexedFiles(join(root, 'Projects', 'vv-raycast'));
    assert.ok(paths.some(file => file.name === 'README.md'));
    const documents = await searchIndexedFiles('Raycast');
    assert.ok(documents.some(file => file.name === 'Raycast-QA.txt'));
    assert.ok(documents.every(file => !file.path.includes('/.hidden/') && !file.path.includes('/node_modules/')));
  } finally { stopFileSearchIndexing(); await rm(root, { recursive: true, force: true }); }
});
