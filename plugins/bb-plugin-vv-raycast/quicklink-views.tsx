import { useEffect, useRef, useState } from 'react';
import { experimental_Icon as Icon } from '@get-bb/plugin-sdk/app';
import { quicklinkFields, resolveQuicklink, type Quicklink } from './quicklinks';

export function QuicklinkEditor({ draft, latest, apps, busy, change, save }: {
  draft: Quicklink; latest?: Quicklink; apps: { title: string; path?: string }[]; busy: boolean;
  change(value: Quicklink): void; save(): Promise<void>;
}) {
  const [tags, setTags] = useState(draft.tags.join(', '));
  return <form id="rc-quicklink-form" className="rc-form rc-quicklink-form" onKeyDown={event => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); event.currentTarget.requestSubmit(); } }} onSubmit={event => { event.preventDefault(); void save(); }}>
    <label>Name &amp; Icon<div className="rc-quicklink-name"><select aria-label="Quicklink icon" value={draft.icon} onChange={event => change({ ...draft, icon: event.target.value as Quicklink['icon'] })}>{['Link', 'Globe', 'Search', 'Folder'].map(icon => <option key={icon}>{icon}</option>)}</select><input autoFocus required maxLength={100} aria-label="Quicklink name" placeholder="Quicklink name" value={draft.title} onChange={event => change({ ...draft, title: event.target.value })} /></div></label>
    <label>Link<input aria-label="Link" aria-describedby="rc-quicklink-link-help" required maxLength={4096} placeholder={'https://example.com/search?q={argument name="Query"}'} value={draft.link} onChange={event => change({ ...draft, link: event.target.value })} /><small id="rc-quicklink-link-help">Use a website URL, deeplink or Home path. {'{argument name="Query"}'} asks for a value when opened.</small></label>
    <label>Open With<select value={draft.applicationPath} onChange={event => change({ ...draft, applicationPath: event.target.value })}><option value="">Default application</option>{draft.applicationPath && !apps.some(app => app.path === draft.applicationPath) && <option value={draft.applicationPath}>Selected application unavailable</option>}{apps.filter(app => app.path).map(app => <option key={app.path} value={app.path}>{app.title}</option>)}</select></label>
    <label>Tags<input aria-label="Quicklink tags" placeholder="Work, Research" value={tags} onChange={event => { setTags(event.target.value); change({ ...draft, tags: event.target.value.split(',').map(tag => tag.trim()).filter(Boolean) }); }} /><small>Separate tags with commas.</small></label>
    <label className="rc-quicklink-check"><input type="checkbox" checked={draft.pinned} onChange={event => change({ ...draft, pinned: event.target.checked })} />Pin to top of Quicklinks</label>
    <label className="rc-quicklink-check"><input type="checkbox" checked={draft.hidden} onChange={event => change({ ...draft, hidden: event.target.checked })} />Hide in Root Search</label>
    {latest && latest.revision !== draft.revision && <p role="alert">The saved Quicklink changed. <button type="button" title="Reload saved version" aria-description="Replaces this unsaved draft with the current saved Quicklink." onClick={() => { change(latest); setTags(latest.tags.join(', ')); }}>Reload saved version</button></p>}
    <p>Saving stores this shortcut; it does not open the destination.</p>
  </form>;
}

// Adapted from the donor QuickLinkDynamicPromptOverlay; native dialog adds focus containment and return.
export function QuicklinkArguments({ link, error, busy, close, open }: { link: Quicklink; error: string; busy: boolean; close(): void; open(values: Record<string, string>): Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const fields = quicklinkFields(link.link);
  const [values, setValues] = useState(() => Object.fromEntries(fields.map(field => [field.key, field.defaultValue ?? ''])));
  useEffect(() => { dialog.current?.showModal(); }, []);
  let preview = '';
  try { preview = resolveQuicklink(link.link, values); } catch {}
  return <dialog ref={dialog} className="rc-quicklink-dialog" aria-label="Quicklink arguments" onCancel={event => { event.preventDefault(); if (!busy) close(); }}><form onSubmit={event => { event.preventDefault(); if (!busy) void open(values); }}>
    <h2>Fill Quicklink Arguments</h2><p>{link.title}</p>
    {fields.map((field, index) => <label key={field.key}>{field.name}<input autoFocus={index === 0} required maxLength={2000} value={values[field.key] ?? ''} onChange={event => setValues(old => ({ ...old, [field.key]: event.target.value }))} /></label>)}
    <output aria-label="Resolved destination">{preview || 'Enter arguments to preview the destination.'}</output>
    {error && <p role="alert" className="rc-error">{error}</p>}<div className="rc-dialog-actions"><button type="button" title="Cancel opening Quicklink" aria-description="Click, press Enter or Escape to return without opening a destination." disabled={busy} onClick={close}>Cancel <kbd>Esc</kbd></button><button type="submit" title="Open Quicklink" aria-description="Click or press Enter to open this destination in its selected application." disabled={busy || !preview}><Icon name="ExternalLink" className="rc-icon small" />{busy ? 'Opening…' : 'Open Link'} <kbd>↵</kbd></button></div>
  </form></dialog>;
}

export function QuicklinkDelete({ link, error, busy, close, remove }: { link: Quicklink; error: string; busy: boolean; close(): void; remove(): Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="rc-quicklink-dialog" aria-label="Delete Quicklink" onCancel={event => { event.preventDefault(); if (!busy) close(); }}><form onSubmit={event => { event.preventDefault(); if (!busy) void remove(); }}><h2>Delete “{link.title}”?</h2><p>This removes the saved shortcut. Its destination is unchanged.</p>{error && <p role="alert" className="rc-error">{error}</p>}<div className="rc-dialog-actions"><button autoFocus type="button" title="Keep Quicklink" aria-description="Click, press Enter or Escape to keep the saved shortcut." disabled={busy} onClick={close}>Cancel</button><button type="submit" className="rc-destructive" title="Delete saved Quicklink" aria-description="Permanently removes this saved shortcut from the plugin." disabled={busy}>Delete Quicklink</button></div></form></dialog>;
}
