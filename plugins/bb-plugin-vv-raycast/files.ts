import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, realpath, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';
import ignore from 'ignore';
import { FILE_SEARCH_INDEX_NOISY_DIRECTORY_NAMES } from '../../src/main/file-search-index';

const run = promisify(execFile);
const noise = new Set<string>(FILE_SEARCH_INDEX_NOISY_DIRECTORY_NAMES);
export type FileResult = { id: string; title: string; path: string; subtitle: string; directory: boolean; size: number; modifiedAt: number; createdAt: number };
type Runner = (file: string, args: string[], options: { signal?: AbortSignal; timeout: number; maxBuffer: number }) => Promise<{ stdout: string }>;
type IndexSearch = (query: string) => Promise<{ paths: string[]; indexing: boolean; indexedEntries: number; limited: boolean }>;
export function createFileSearch(home = homedir(), execute: Runner = run, indexSearch?: IndexSearch) {
  const selections = new Map<string, { path: string; device: number; inode: number; expires: number }>();
  async function searchable(path: string, rules: Map<string, ReturnType<typeof ignore>>, directoryEntry = false) {
    const rel = relative(home, path);
    const parts = rel.split(sep);
    if (!isAbsolute(path) || !rel || rel.startsWith(`..${sep}`) || rel === '..' || parts[0] === 'Library' || parts.some(part => part.startsWith('.') || noise.has(part.toLowerCase()))) return false;
    for (let directory = home, depth = 0; depth < parts.length; directory = join(directory, parts[depth++])) {
      let matcher = rules.get(directory);
      if (!matcher) {
        matcher = ignore();
        for (const name of ['.git/info/exclude', '.gitignore', '.ignore', '.rayignore']) {
          try {
            const file = join(directory, name);
            if ((await stat(file)).size > 65536) throw new Error('An ignore file exceeds 64 KB. File Search stopped before returning matches.');
            matcher.add(await readFile(file, 'utf8'));
          } catch (error) { if (!['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error; }
        }
        rules.set(directory, matcher);
      }
      if (matcher.ignores(parts.slice(depth).join('/') + (directoryEntry ? '/' : ''))) return false;
    }
    return true;
  }
  return {
    async search(query: string, signal?: AbortSignal): Promise<{ files: FileResult[]; source: string; indexing: boolean; indexedEntries: number; indexLimited: boolean }> {
      if (process.platform !== 'darwin') throw new Error('File Search currently requires a macOS VV host.');
      if (query.length > 200 || /[\0\r\n]/.test(query)) throw new Error('Enter a file name of at most 200 characters.');
      const term = query.trim();
      const directPath = term.startsWith('~/') ? join(home, term.slice(2)) : isAbsolute(term) ? term : null;
      const args = ['-0', '-onlyin', home, ...(term ? ['-name', term] : ['kMDItemLastUsedDate >= $time.today(-14)'])];
      const indexed = !directPath && term && indexSearch ? await indexSearch(term) : null;
      const candidates = directPath ? [directPath] : indexed?.paths ?? (await execute('/usr/bin/mdfind', args, { signal, timeout: 5000, maxBuffer: 2 * 1024 * 1024 })).stdout.split('\0');
      const rules = new Map<string, ReturnType<typeof ignore>>();
      const files: FileResult[] = [];
      const seen = new Set<string>();
      for (const candidate of candidates.slice(0, 500)) {
        signal?.throwIfAborted();
        if (!candidate || seen.has(candidate) || !await searchable(candidate, rules)) continue;
        seen.add(candidate);
        try {
          const path = await realpath(candidate);
          const metadata = await stat(path);
          if (!await searchable(path, rules, metadata.isDirectory())) continue;
          if (!metadata.isDirectory() && !metadata.isFile()) continue;
          const id = randomUUID();
          for (const [key, selection] of selections) if (selection.expires < Date.now() || selections.size >= 200) selections.delete(key);
          selections.set(id, { path, device: metadata.dev, inode: metadata.ino, expires: Date.now() + 5 * 60_000 });
          files.push({ id, title: basename(path), path, subtitle: '~/' + relative(home, dirname(path)), directory: metadata.isDirectory(), size: metadata.size, modifiedAt: metadata.mtimeMs, createdAt: metadata.birthtimeMs });
        } catch (error) { if (!['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error; }
        if (files.length >= 50) break;
      }
      files.sort((a, b) => term ? Number(b.title.toLowerCase().startsWith(term.toLowerCase())) - Number(a.title.toLowerCase().startsWith(term.toLowerCase())) || a.title.localeCompare(b.title) : b.modifiedAt - a.modifiedAt);
      return { files, source: directPath ? 'Path · Home' : indexed ? 'Local index + Spotlight · Home · Names only' : 'Spotlight · Recently used', indexing: indexed?.indexing ?? false, indexedEntries: indexed?.indexedEntries ?? 0, indexLimited: indexed?.limited ?? false };
    },
    async open(id: string, reveal: boolean, signal?: AbortSignal) {
      const selection = selections.get(id);
      if (!selection || selection.expires < Date.now()) throw new Error('File selection expired. Search again before opening.');
      const path = await realpath(selection.path);
      const metadata = await stat(path);
      if (path !== selection.path || metadata.dev !== selection.device || metadata.ino !== selection.inode) throw new Error('File changed since selection. Search again before opening.');
      if (!await searchable(path, new Map(), metadata.isDirectory())) throw new Error('File is now excluded from search. Search again before opening.');
      await execute('/usr/bin/open', [...(reveal ? ['-R'] : []), path], { signal, timeout: 10000, maxBuffer: 65536 });
      return { opened: true };
    },
  };
}
