import type { Quicklink } from './quicklink-schema';
export type { Quicklink } from './quicklink-schema';

export function isQuicklinkDraft(value: unknown): value is Quicklink {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Record<string, unknown>;
  return typeof draft.id === 'string' && /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(draft.id)
    && Number.isInteger(draft.revision) && Number(draft.revision) >= 0 && typeof draft.title === 'string' && typeof draft.link === 'string'
    && typeof draft.applicationPath === 'string' && typeof draft.icon === 'string' && ['Link', 'Globe', 'Search', 'Folder'].includes(draft.icon)
    && Array.isArray(draft.tags) && draft.tags.every(tag => typeof tag === 'string') && typeof draft.pinned === 'boolean' && typeof draft.hidden === 'boolean';
}

export type QuicklinkField = { key: string; name: string; defaultValue?: string };
// Adapted from SuperCmd's snippet-store argument parser; no clipboard or snippet-store access.
function argument(token: string): QuicklinkField {
  const match = token.match(/^argument(?:\s+name="([^"{}]+)"|:([^{}]+))?(?:\s+default="([^"{}]*)")?$/i);
  if (!match) throw new Error('Use {argument name="Query"} placeholders. Other dynamic values are not supported yet.');
  const name = (match[1] || match[2] || 'Argument').trim();
  if (!name || name.length > 100) throw new Error('Argument names must be 1–100 characters.');
  return { key: name.toLowerCase(), name, ...(match[3] !== undefined ? { defaultValue: match[3] } : {}) };
}

export function quicklinkFields(template: string): QuicklinkField[] {
  if (!template || template.length > 4096 || /[\x00-\x1f\x7f]/.test(template)) throw new Error('Enter a link of at most 4,096 characters without line breaks.');
  const fields = new Map<string, QuicklinkField>();
  const remaining = template.replace(/\{([^{}]+)\}/g, (_token, value: string) => {
    const field = argument(value);
    const old = fields.get(field.key);
    if (old && old.defaultValue !== field.defaultValue) throw new Error('Repeated arguments must use the same default value.');
    fields.set(field.key, field);
    return 'value';
  });
  if (/[{}]/.test(remaining)) throw new Error('Check the argument placeholder braces.');
  if (fields.size > 10) throw new Error('A Quicklink supports up to ten arguments.');
  quicklinkTarget(remaining);
  return Array.from(fields.values());
}

export function quicklinkTarget(target: string): { kind: 'file' | 'url'; target: string } {
  if (!target || target.length > 16000 || /[\x00-\x1f\x7f]/.test(target)) throw new Error('Invalid Quicklink destination.');
  if (target.startsWith('/') || target.startsWith('~/')) return { kind: 'file', target };
  let url: URL;
  try { url = new URL(target); } catch { throw new Error('Use a URL, deeplink, or an absolute/Home file path.'); }
  if (['javascript:', 'data:', 'vbscript:', 'blob:', 'about:', 'chrome:', 'shell:', 'applescript:'].includes(url.protocol)) throw new Error('This URL scheme cannot be opened as a Quicklink.');
  if (url.protocol === 'file:') {
    if (url.hostname && url.hostname !== 'localhost') throw new Error('Remote file links are not supported.');
    return { kind: 'file', target };
  }
  return { kind: 'url', target: url.href };
}

export function resolveQuicklink(template: string, values: Record<string, string> = {}): string {
  quicklinkFields(template);
  const localPath = template.startsWith('/') || template.startsWith('~/');
  const resolved = template.replace(/\{([^{}]+)\}/g, (_token, value: string) => {
    const field = argument(value);
    const text = Object.hasOwn(values, field.key) ? values[field.key] : field.defaultValue;
    if (text === undefined || !text.trim()) throw new Error(`Enter ${field.name}.`);
    if (text.length > 2000 || /[\x00-\x1f\x7f]/.test(text)) throw new Error(`${field.name} is too long or contains a line break.`);
    return localPath ? text : encodeURIComponent(text);
  });
  return quicklinkTarget(resolved).target;
}

