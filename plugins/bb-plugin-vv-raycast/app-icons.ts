import { execFile } from 'node:child_process';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, sep } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
export async function appIconData(appPath: string, signal: AbortSignal): Promise<string | null> {
  let icon: string;
  try {
    const info = await run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIconFile', join(appPath, 'Contents', 'Info.plist')], { timeout: 3000, signal });
    const name = basename(info.stdout.trim());
    if (!name || name === '.' || name === '..') return null;
    const resources = await realpath(join(appPath, 'Contents', 'Resources'));
    icon = await realpath(join(resources, /\.(icns|png|tiff?)$/i.test(name) ? name : `${name}.icns`));
    if (!icon.startsWith(resources + sep)) return null;
  } catch (error) { if (signal.aborted) throw error; return null; }
  const directory = await mkdtemp(join(tmpdir(), 'vv-raycast-icon-'));
  try {
    const output = join(directory, 'icon.png');
    await run('/usr/bin/sips', ['-s', 'format', 'png', '-Z', '64', icon, '--out', output], { timeout: 5000, signal });
    const bytes = await readFile(output);
    if (bytes.length > 100000 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return null;
    return `data:image/png;base64,${bytes.toString('base64')}`;
  } catch (error) { if (signal.aborted) throw error; return null; }
  finally { await rm(directory, { recursive: true, force: true }); }
}
