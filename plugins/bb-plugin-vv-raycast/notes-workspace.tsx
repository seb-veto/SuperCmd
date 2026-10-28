import { useCallback, useEffect, useRef, useState } from 'react';
import { Markdown, useRpc, useRealtime, experimental_copyToClipboard } from '@get-bb/plugin-sdk/app';
import { LauncherIcon as Icon } from './launcher-icon';
import type { contract } from './contract';
import { isNoteDraft, noteAutosave, noteTitle, type Note, type NoteInput, type NoteSummary } from './note-autosave';
import { BlockEditor, type BlockEditorHandle } from './vendor/NotesBlockEditor';

type Session = ReturnType<typeof noteAutosave>;
const accents = { default: '#ed6363', rose: '#fb7185', amber: '#fbbf24', emerald: '#34d399', blue: '#60a5fa', violet: '#a78bfa' };
const key = (id: string) => `vv-raycast:note-draft:${id}`;
function recovered(id: string) { try { const value: unknown = JSON.parse(localStorage.getItem(key(id)) ?? 'null'); return isNoteDraft(value) ? value : null; } catch { return null; } }

export function NotesWorkspace({ initialId, create, search, onClose }: { initialId?: string; create?: boolean; search?: boolean; onClose(): void }) {
  const rpc = useRpc<typeof contract>();
  const [session, setSession] = useState<Session | null>(null), [deletedNote, setDeletedNote] = useState<Note | null>(null);
  const [notice, setNotice] = useState('');
  const [version, setVersion] = useState(0), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const [browse, setBrowse] = useState(false), [query, setQuery] = useState(''), [deleted, setDeleted] = useState(false);
  const [notes, setNotes] = useState<NoteSummary[]>([]), [more, setMore] = useState(false), [listVersion, setListVersion] = useState(0);
  const [toolbar, setToolbar] = useState(true), [actions, setActions] = useState(false);
  const listGeneration = useRef(0), pageBusy = useRef(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const editor = useRef<BlockEditorHandle>(null), current = useRef<Session | null>(null), generation = useRef(0);
  const workspace = useRef<HTMLDivElement>(null), browseSearch = useRef<HTMLInputElement>(null), menuButton = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null), browseButton = useRef<HTMLButtonElement>(null);
  const changed = useCallback(() => setVersion(value => value + 1), []);
  const report = useCallback((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)), []);

  const keepCurrent = useCallback(async () => {
    const active = current.current;
    if (!active) return;
    const content = editor.current?.getContent();
    if (content !== undefined) active.update({ content });
    try { await active.flush(); } catch (cause) { report(cause); if (!active.recoverable) throw cause; }
  }, [report]);

  const activate = useCallback(async (id?: string, fresh = false) => {
    const token = ++generation.current;
    setLoading(true); setError('');
    try {
      await keepCurrent();
      const local = id ? recovered(id) : null;
      const saved = id && (!local || local.revision > 0) ? await rpc.call('noteGet', { id }) : null;
      if (token !== generation.current) return;
      if (saved?.deletedAt !== null && saved) { setDeletedNote(saved); setSession(null); current.current = null; setBrowse(false); return; }
      const initial: NoteInput = !fresh && local?.dirty ? local : saved ?? (!fresh && local ? local : { id: crypto.randomUUID(), revision: 0, content: '', theme: 'default', pinned: false });
      const next = noteAutosave(initial, Boolean(!fresh && local?.dirty), value => rpc.call('noteSave', value), value => {
        localStorage.setItem(key(value.id), JSON.stringify(value)); localStorage.setItem('vv-raycast:notes-active', value.id);
      }, changed);
      current.current = next; setSession(next); setDeletedNote(null); setBrowse(false);
    } catch (cause) { report(cause); }
    finally { if (token === generation.current) setLoading(false); }
  }, [rpc, keepCurrent, changed, report]);

  useEffect(() => {
    let id = initialId;
    if (!id && !create) { try { id = localStorage.getItem('vv-raycast:notes-active') ?? undefined; } catch {} }
    let gone = false;
    void activate(id, create).then(() => { if (!gone && search) setBrowse(true); });
    return () => { gone = true; generation.current++; void current.current?.flush().catch(() => {}); };
  }, []);
  useEffect(() => {
    if (!session?.dirty || session.saving || session.error || deletedNote) return;
    const timer = setTimeout(() => { void session.flush().catch(report); }, 500);
    return () => clearTimeout(timer);
  }, [session, version, deletedNote, report]);
  useEffect(() => {
    let cancelled = false;
    listGeneration.current++;
    const timer = setTimeout(() => { rpc.call('noteList', { query, deleted, offset: 0 }).then(result => { if (!cancelled) { setNotes(result.notes); setMore(result.more); } }, report); }, 150);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [rpc, query, deleted, listVersion, report]);
  useRealtime('notesChanged', () => setListVersion(value => value + 1));
  useEffect(() => { if (browse) browseSearch.current?.focus(); }, [browse]);

  useEffect(() => { if (actions) menu.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus(); }, [actions]);
  const update = useCallback((content: string) => session?.update({ content }), [session]);
  const close = async () => { try { await keepCurrent(); onClose(); } catch {} };
  const value = session?.value;
  async function copy() {
    const content = editor.current?.getContent() ?? deletedNote?.content ?? value?.content ?? '';
    if (!await experimental_copyToClipboard({ text: content })) throw new Error('Clipboard is unavailable.');
  }
  async function noteAction(action: 'delete' | 'restore') {
    try {
      if (action === 'delete') {
        await keepCurrent();
        const active = current.current;
        if (!active?.value.revision || active.dirty) throw new Error('Save this draft before deleting the note.');
        const saved = await rpc.call('noteAction', { id: active.value.id, revision: active.value.revision, action });
        setDeletedNote(saved); current.current = null; setSession(null);
      } else if (deletedNote) {
        const saved = await rpc.call('noteAction', { id: deletedNote.id, revision: deletedNote.revision, action });
        await activate(saved.id);
      }
      setActions(false); setError('');
    } catch (cause) { report(cause); }
  }
  async function saveAsNew() {
    const active = current.current;
    if (!active) return;
    const content = editor.current?.getContent();
    if (content !== undefined) active.update({ content });
    const previous = active.value;
    const initial = { ...previous, id: crypto.randomUUID(), revision: 0 };
    const next = noteAutosave(initial, true, value => rpc.call('noteSave', value), value => { localStorage.setItem(key(value.id), JSON.stringify(value)); localStorage.setItem('vv-raycast:notes-active', value.id); }, changed);
    current.current = next; setSession(next); setError('');
    try { await next.flush(); if (!next.dirty && next.value.content === previous.content && next.value.theme === previous.theme && next.value.pinned === previous.pinned) { const local = recovered(previous.id); if (local && local.content === previous.content && local.revision === previous.revision) localStorage.removeItem(key(previous.id)); } } catch (cause) { report(cause); }
  }
  async function loadMore() {
    if (pageBusy.current) return;
    pageBusy.current = true; setLoadingMore(true);
    const token = listGeneration.current;
    try {
      const result = await rpc.call('noteList', { query, deleted, offset: notes.length });
      if (token === listGeneration.current) { setNotes(old => [...old, ...result.notes]); setMore(result.more); }
    } catch (cause) { if (token === listGeneration.current) report(cause); }
    finally { pageBusy.current = false; setLoadingMore(false); }
  }
  const status = loading ? 'Loading…' : deletedNote ? 'Recently Deleted' : session?.saving ? 'Saving…' : session?.error ? 'Draft kept · Save failed' : session?.dirty ? 'Unsaved changes' : value?.revision ? 'Saved' : 'Draft';

  return <div ref={workspace} role="region" aria-label="Raycast Notes" className="rc-notes-workspace" style={{ '--note-accent': accents[value?.theme ?? deletedNote?.theme ?? 'default'] } as React.CSSProperties} onKeyDown={event => {
    if (event.defaultPrevented) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (actions) { setActions(false); menuButton.current?.focus(); } else if (browse) { setBrowse(false); browseButton.current?.focus(); } else void close(); }
    if (!(event.metaKey || event.ctrlKey)) return;
    if (event.key.toLowerCase() === 'n') { event.preventDefault(); void activate(undefined, true); }
    if (event.key.toLowerCase() === 'p' && !event.shiftKey) { event.preventDefault(); setBrowse(value => !value); }
    if (event.key.toLowerCase() === 'k') { event.preventDefault(); setActions(value => !value); }
  }}>
    <header className="rc-notes-header"><button title="Back to Root Search" aria-label="Back to Root Search" aria-description="Click or press Escape to return. Changes are saved or kept as a recovery draft." onClick={() => void close()}>‹</button><strong>{noteTitle(deletedNote?.content ?? value?.content ?? '')}</strong><button ref={menuButton} title="Show Notes actions" aria-label="Show Notes actions" aria-expanded={actions} aria-description="Click or press Command K to copy, pin, color or delete this note." onClick={() => setActions(value => !value)}>⌘</button><button ref={browseButton} title="Browse Notes" aria-label="Browse Notes" aria-expanded={browse} aria-description="Click or press Command P to search notes by title and content." onClick={() => setBrowse(value => !value)}><Icon name="PanelTop" className="rc-icon" /></button><button title="Create Note" aria-label="Create Note" aria-description="Click or press Command N to open a blank note. Typing saves it automatically." onClick={() => void activate(undefined, true)}><Icon name="Plus" className="rc-icon" /></button></header>
    {notice && <p role="status" className="rc-notes-error">{notice}</p>}
    {error && <div role="alert" className="rc-notes-error">{error}{session && <div><button title="Retry saving note" aria-description="Retries the same saved identity and revision; conflicting edits are retained." onClick={() => { void session.flush(true).then(() => setError(''), report); }}>Retry Save</button><button title="Save as new note" aria-description="Saves this recovery draft under a new note identity, preserving the existing note." onClick={() => void saveAsNew()}>Save as New Note</button></div>}</div>}
    {session && !session.recoverable && <p role="alert" className="rc-notes-error">Local draft storage is unavailable. Keep this window open until saving succeeds, or copy your text.</p>}
    <div className="rc-notes-content">{deletedNote ? <><p className="rc-note-deleted-label">This note is read-only. Restore it to edit.</p><Markdown content={deletedNote.content} /></> : session && <BlockEditor key={value!.id} initialContent={value!.content} onContentChange={update} accentColor={accents[value!.theme]} editorRef={editor} onNotice={setNotice} />}</div>
    {toolbar && session && <div className="rc-note-formatbar" role="toolbar" aria-label="Note formatting">
      {(['h1', 'h2', 'h3', 'blockquote', 'ordered', 'bullet', 'checkbox', 'code', 'divider'] as const).map((type, index) => <button key={type} title={['Heading 1', 'Heading 2', 'Heading 3', 'Blockquote', 'Ordered list', 'Bullet list', 'Task list', 'Code block', 'Divider'][index]} aria-label={['Heading 1', 'Heading 2', 'Heading 3', 'Blockquote', 'Ordered list', 'Bullet list', 'Task list', 'Code block', 'Divider'][index]} aria-description="Click or press Enter to format the current block. Dividers preserve its text." onMouseDown={event => event.preventDefault()} onClick={() => editor.current?.insertBlockType(type)}>{index < 3 ? `H${index + 1}` : <Icon name={['', '', '', 'Quote', 'ListOrdered', 'List', 'ListChecks', 'Code', 'Minus'][index]} className="rc-icon" />}</button>)}
      {([['Bold', '**', '**', 'Bold'], ['Italic', '*', '*', 'Italic'], ['Strikethrough', '~~', '~~', 'Strikethrough'], ['Underline', '<u>', '</u>', 'Underline'], ['Inline code', '`', '`', 'Code'], ['Link', '[', '](https://example.com)', 'Link']] as const).map(([label, prefix, suffix, icon]) => <button key={label} title={label} aria-label={label} aria-description="Click or press Enter to format selected text, or insert markers at the cursor." onMouseDown={event => event.preventDefault()} onClick={() => editor.current?.wrapSelection(prefix, suffix)}><Icon name={icon} className="rc-icon" /></button>)}
    </div>}
    <footer className="rc-notes-footer"><span role="status">{status}</span><span>{(deletedNote?.content ?? value?.content ?? '').length} characters</span><button title="Toggle format bar" aria-label="Toggle format bar" aria-pressed={toolbar} aria-description="Click or press Enter to show or hide the formatting controls below the note." onClick={() => setToolbar(value => !value)}><Icon name="Type" className="rc-icon small" /></button></footer>
    {actions && <div ref={menu} role="menu" aria-label="Notes actions" onKeyDown={event => {
      const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role=menuitem]:not([disabled])'));
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) && items.length) { event.preventDefault(); const index = items.indexOf(document.activeElement as HTMLButtonElement); items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus(); }
    }} className="rc-note-actions"><button role="menuitem" title="Copy note Markdown" aria-description="Click or press Enter to copy this note as Markdown." onClick={() => { void copy().then(() => setActions(false), report); }}>Copy Markdown</button>{session && <><button role="menuitem" title={value?.pinned ? 'Unpin note' : 'Pin note'} aria-description="Click or press Enter to change whether this note appears first in the browser." onClick={() => { session.update({ pinned: !value?.pinned }); setActions(false); }}>{value?.pinned ? 'Unpin Note' : 'Pin Note'}</button><label>Color<select aria-label="Note color" value={value?.theme} onChange={event => session.update({ theme: event.target.value as NoteInput['theme'] })}>{Object.keys(accents).map(theme => <option key={theme}>{theme}</option>)}</select></label><button role="menuitem" title="Delete note" aria-description="Moves this note to Recently Deleted. It can be restored." disabled={!value?.revision} onClick={() => void noteAction('delete')}>Delete Note</button></>}{deletedNote && <button role="menuitem" title="Restore note" aria-description="Moves this note out of Recently Deleted and makes it editable again." onClick={() => void noteAction('restore')}>Restore Note</button>}</div>}
    {browse && <aside className="rc-notes-browser" role="dialog" aria-label="Browse Notes"><input ref={browseSearch} aria-label="Search Notes" placeholder="Search Notes…" maxLength={200} value={query} onChange={event => setQuery(event.target.value)} /><div>{notes.map(note => <button key={note.id} title="Open note" aria-description="Click or press Enter to open this note. Deleted notes open read-only." onClick={() => void activate(note.id)}>{note.pinned && <Icon name="Pin" className="rc-icon small" />}<span>{note.title}</span></button>)}{!notes.length && <p>{deleted ? 'No recently deleted notes' : 'No matching notes'}</p>}{more && <button title="Load more notes" aria-description="Adds the next page of notes to this list." disabled={loadingMore} onClick={() => void loadMore()}>Load More</button>}</div><button className="rc-note-deleted-toggle" title={deleted ? 'Show active notes' : 'Show deleted notes'} aria-pressed={deleted} aria-description="Switches the browser between active and recently deleted notes." onClick={() => setDeleted(value => !value)}>{deleted ? 'Back to Notes' : 'Recently Deleted'}</button></aside>}
  </div>;
}
