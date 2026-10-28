import { realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { quicklinkTarget } from './quicklinks';

export function quicklinkOpener(home: string, apps: () => Promise<{ path: string }[]>, run: (file: string, args: string[], options: { timeout: number; signal?: AbortSignal }) => Promise<unknown>) {
  return async (target: string, applicationPath: string, signal?: AbortSignal) => {
    const destination = quicklinkTarget(target);
    if (destination.kind === 'file') {
      const path = target.startsWith('file:') ? fileURLToPath(target) : target.startsWith('~/') ? resolve(home, target.slice(2)) : target;
      const actual = await realpath(path);
      const root = await realpath(home);
      const inside = relative(root, actual);
      if (inside === '..' || inside.startsWith('../') || isAbsolute(inside)) throw new Error('Quicklink file destinations must remain inside Home.');
      target = actual;
    } else target = destination.target;
    if (applicationPath && !(await apps()).some(app => app.path === applicationPath)) throw new Error('The selected application is no longer installed. Edit this Quicklink.');
    await run('/usr/bin/open', [...(applicationPath ? ['-a', applicationPath] : []), '--', target], { timeout: 10000, signal });
    return { opened: true };
  };
}
