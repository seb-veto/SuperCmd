import { experimental_defineHostEntry, type ExperimentalHostWorkerLease } from '@get-bb/plugin-sdk/host';
import { readdir, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { hostContract } from './contract';
import { appIconData } from './app-icons';
import { createFileSearch } from './files';
import { getFileSearchIndexStatus, rebuildFileSearchIndex, searchIndexedFiles, stopFileSearchIndexing } from '../../src/main/file-search-index';
export { createFileSearch } from './files';
const run = promisify(execFile);
const icons = new Map<string, Promise<string | null>>();
let indexLease: ExperimentalHostWorkerLease | null = null;
const fileSearch = createFileSearch(homedir(), undefined, async query => {
  const found = await searchIndexedFiles(query, { limit: 500, includeProtectedHomeRoots: true });
  const status = getFileSearchIndexStatus();
  if (status.lastError) throw new Error(status.lastError);
  return { paths: found.map(file => file.path), indexing: status.indexing, indexedEntries: status.indexedEntryCount, limited: status.limitReached };
});
async function apps() {
  if (process.platform !== 'darwin') throw new Error('Application launching currently requires a macOS VV host.');
  const roots = ['/Applications', '/System/Applications', '/System/Applications/Utilities', join(homedir(), 'Applications')];
  const result: { id: string; title: string; path: string }[] = [];
  for (const root of roots) {
    let entries;
    try { entries = await readdir(root, { withFileTypes: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
    for (const entry of entries) if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name.endsWith('.app')) {
      const path = await realpath(join(root, entry.name));
      result.push({ id: path, title: entry.name.slice(0, -4), path });
    }
  }
  return result.sort((a, b) => a.title.localeCompare(b.title));
}
export default experimental_defineHostEntry({
  contract: hostContract,
  dispose: async () => { stopFileSearchIndexing(); await indexLease?.dispose(); },
  handlers: {
    apps,
    files: async ({ query }, context) => {
      const result = await fileSearch.search(query, context.signal);
      if (result.indexing && !indexLease) {
        const lease = context.experimental_retainWorker();
        indexLease = lease;
        void rebuildFileSearchIndex().finally(async () => { try { await lease.dispose(); } finally { if (indexLease === lease) indexLease = null; } }).catch(cause => console.warn('[Raycast] File index cleanup failed', cause));
      }
      return result;
    },
    openFile: ({ id, reveal }, context) => fileSearch.open(id, reveal, context.signal),
    appIcon: async ({ path }, context) => {
      if (!(await apps()).some(app => app.path === path)) throw new Error('Application is not in this host’s catalog.');
      let icon = icons.get(path);
      if (!icon) {
        icon = appIconData(path, context.signal).catch(error => { icons.delete(path); throw error; });
        icons.set(path, icon);
      }
      return icon;
    },
    openApp: async ({ path }, context) => {
      if (!(await apps()).some(app => app.path === path)) throw new Error('Application is not in this host’s catalog. Refresh and select it again.');
      await run('/usr/bin/open', ['-a', path], { timeout: 10000, signal: context.signal });
      return { opened: true };
    },
  },
});
