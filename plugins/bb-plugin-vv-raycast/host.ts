import { experimental_defineHostEntry } from '@get-bb/plugin-sdk/host';
import { readdir, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { hostContract } from './contract';
const run = promisify(execFile);
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
  handlers: {
    apps,
    openApp: async ({ path }, context) => {
      if (!(await apps()).some(app => app.path === path)) throw new Error('Application is not in this host’s catalog. Refresh and select it again.');
      await run('/usr/bin/open', ['-a', path], { timeout: 10000, signal: context.signal });
      return { opened: true };
    },
  },
});
