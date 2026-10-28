import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { NewThreadRequest } from '@get-bb/plugin-sdk';
import { definePluginApp, useRpc, useRealtime, ThreadChat, experimental_NewThreadComposer as NewThreadComposer } from '@get-bb/plugin-sdk/app';
import type { contract, Chat, SavedCommand } from './contract';
import type { CommandInfo } from './types';
import type { LauncherAction } from './command-helpers';
import LauncherCommandRow from './vendor/LauncherCommandRow';
import LauncherActionsOverlay from './vendor/LauncherActionsOverlay';
import './style.css';

const remember = (key: string, value: string) => { try { localStorage.setItem(`vv-raycast:${key}`, value); } catch {} };
const restore = (key: string, fallback = '') => { try { return localStorage.getItem(`vv-raycast:${key}`) ?? fallback; } catch { return fallback; } };
type View = 'root' | 'chat' | 'commands' | 'edit' | 'history';
function Raycast() {
  const rpc = useRpc<typeof contract>();
  const [state, setState] = useState<{ commands: SavedCommand[]; chats: Chat[]; personalProjectId?: string }>({ commands: [], chats: [] });
  const [apps, setApps] = useState<CommandInfo[]>([]), [error, setError] = useState('');
  const [view, setView] = useState<View>(() => restore('view', 'root') === 'chat' ? 'chat' : 'root');
  const [query, setQuery] = useState(''), [selected, setSelected] = useState(0), [menu, setMenu] = useState(false), [actionIndex, setActionIndex] = useState(0);
  const [active, setActive] = useState<string | null>(() => restore('chat') || null), [seed, setSeed] = useState(''), [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false), [draft, setDraft] = useState<SavedCommand | null>(null), [commandInput, setCommandInput] = useState('');
  const [favorites, setFavorites] = useState<string[]>(() => { try { const value: unknown = JSON.parse(restore('favorites', '[]')); return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string').slice(0, 100) : []; } catch { return []; } });
  const [theme, setTheme] = useState(() => restore('theme', 'dark') === 'light' ? 'light' : 'dark');
  const search = useRef<HTMLInputElement>(null), panel = useRef<HTMLDivElement>(null), rows = useRef<(HTMLDivElement | null)[]>([]), sendId = useRef<string | null>(null);
  const report = useCallback((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)), []);
  const refresh = useCallback(async () => { const result = await rpc.call('state'); setState(result); setLoaded(true); }, [rpc]);
  useEffect(() => { refresh().catch(report); rpc.call('apps').then(result => setApps(result.map(app => ({ ...app, category: 'app' }))), report); }, [rpc, refresh, report]);
  useRealtime('changed', () => { refresh().catch(report); });
  useEffect(() => { remember('view', view); }, [view]);
  useEffect(() => { remember('chat', active ?? ''); }, [active]);
  useEffect(() => { remember('favorites', JSON.stringify(favorites)); }, [favorites]);
  useEffect(() => { remember('theme', theme); }, [theme]);
  useEffect(() => { if (menu) panel.current?.focus(); }, [menu]);
  useEffect(() => { if (['root', 'commands', 'history'].includes(view)) search.current?.focus(); }, [view]);
  useEffect(() => { rows.current[selected]?.scrollIntoView({ block: 'nearest' }); }, [selected]);
  const closeMenu = () => { setMenu(false); search.current?.focus(); };
  function go(next: View) { setMenu(false); setView(next); setQuery(''); setSelected(0); setError(''); }
  function newChat(prompt = '') { sendId.current = null; setActive(null); setSeed(prompt); go('chat'); }
  function edit(command?: SavedCommand) {
    const fresh = command ?? { id: crypto.randomUUID(), title: '', prompt: '', revision: 0 };
    try { const saved = JSON.parse(restore(`command:${fresh.id}`, 'null')); setDraft(saved?.id === fresh.id && typeof saved.title === 'string' && typeof saved.prompt === 'string' && Number.isInteger(saved.revision) ? saved : fresh); } catch { setDraft(fresh); }
    go('edit');
  }
  const catalog: CommandInfo[] = view === 'history' ? state.chats.map(chat => ({ id: `chat:${chat.id}`, title: chat.title, subtitle: 'AI Chat', category: 'extension' })) : [
    ...(view === 'root' ? [
      { id: 'ai', title: 'AI Chat', subtitle: 'Raycast AI', category: 'extension' as const, iconEmoji: '✦' },
      { id: 'commands', title: 'Search AI Commands', subtitle: 'Raycast AI', category: 'extension' as const, iconEmoji: '⌘' },
      { id: 'create', title: 'Create AI Command', subtitle: 'Raycast AI', category: 'extension' as const, iconEmoji: '＋' },
      { id: 'history', title: 'Search AI Chats', subtitle: 'Raycast AI', category: 'extension' as const, iconEmoji: '◷' },
    ] : []),
    ...state.commands.map(command => ({ id: `command:${command.id}`, title: command.title, subtitle: 'AI Command', category: 'extension' as const })),
    ...(view === 'root' ? apps : []),
  ];
  const filtered = catalog.filter(item => `${item.title} ${item.subtitle ?? ''}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => Number(favorites.includes(b.id)) - Number(favorites.includes(a.id)));
  const item = filtered[selected];
  async function run(command: CommandInfo) {
    if (busy) return;
    if (command.category === 'app' && command.path) {
      setBusy(true); try { await rpc.call('openApp', { path: command.path }); } catch (cause) { report(cause); } finally { setBusy(false); }
    } else if (command.id === 'ai') newChat(query);
    else if (command.id === 'commands') go('commands');
    else if (command.id === 'create') edit();
    else if (command.id === 'history') go('history');
    else if (command.id.startsWith('chat:')) { setActive(command.id.slice(5)); go('chat'); }
    else if (command.id.startsWith('command:')) {
      const saved = state.commands.find(row => row.id === command.id.slice(8));
      if (saved) { setCommandInput(''); setDraft(saved); go('chat'); setActive(null); setSeed(saved.prompt); sendId.current = null; }
    }
  }
  const actions: LauncherAction[] = item ? [
    { id: 'open', title: item.category === 'app' ? 'Open Application' : 'Open Command', shortcut: 'Enter', execute: () => run(item) },
    { id: 'favorite', title: favorites.includes(item.id) ? 'Remove from Favorites' : 'Add to Favorites', shortcut: 'Cmd+F', execute: () => setFavorites(previous => previous.includes(item.id) ? previous.filter(id => id !== item.id) : [...previous, item.id]) },
    ...(item.id.startsWith('command:') ? [{ id: 'edit', title: 'Edit AI Command', shortcut: 'Cmd+E', execute: () => edit(state.commands.find(row => row.id === item.id.slice(8))) }] : []),
    { id: 'theme', title: 'Toggle Appearance', separatorBefore: true, execute: () => setTheme(previous => previous === 'dark' ? 'light' : 'dark') },
  ] : [];
  function keyDown(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && ['root', 'commands', 'history'].includes(view)) { event.preventDefault(); setActionIndex(0); setMenu(previous => !previous); return; }
    if (menu) return;
    if (event.key === 'Escape') { event.preventDefault(); if (query) setQuery(''); else go('root'); search.current?.focus(); return; }
    if (event.target !== search.current) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setSelected(previous => Math.max(0, Math.min(filtered.length - 1, previous + (event.key === 'ArrowDown' ? 1 : -1)))); }
    if (event.key === 'Enter' && item) { event.preventDefault(); void run(item); }
    if (event.key === 'Tab' && view === 'root' && query) { event.preventDefault(); newChat(query); }
    if ((event.metaKey || event.ctrlKey) && /^[1-9]$/.test(event.key)) { event.preventDefault(); const command = filtered[Number(event.key) - 1]; if (command) void run(command); }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f' && item) { event.preventDefault(); void actions[1].execute(); }
  }
  async function send(request: NewThreadRequest) {
    if (busy) throw new Error('A send is already pending.');
    setBusy(true); setError(''); sendId.current ??= crypto.randomUUID();
    try { const chat = await rpc.call('start', { id: sendId.current, request }); setActive(chat.id); await refresh(); }
    catch (cause) { report(cause); await refresh().catch(report); throw cause; }
    finally { setBusy(false); }
  }
  const chat = state.chats.find(row => row.id === active);
  function updateDraft(value: SavedCommand) { setDraft(value); remember(`command:${value.id}`, JSON.stringify(value)); }
  return <div className={`vv-raycast-page ${theme}`} onKeyDown={keyDown}>
    <section className={`rc-window ${view === 'chat' ? 'rc-chat-window' : ''}`} aria-label="Raycast launcher">
      <header className="rc-search">
        {view === 'root' && <span className="rc-search-mark" aria-hidden="true">▧</span>}
        {view !== 'root' && <button aria-label="Back to Root Search" title="Back to Root Search" onClick={() => go('root')}>‹</button>}
        {['root', 'commands', 'history'].includes(view) ? <input ref={search} role="combobox" aria-label={view === 'root' ? 'Search for apps or commands' : view === 'commands' ? 'Search AI Commands' : 'Search AI Chats'} aria-expanded="true" aria-controls="rc-results" aria-activedescendant={item ? `rc-${selected}` : undefined} placeholder={view === 'root' ? 'Search for apps or commands…' : view === 'commands' ? 'Search AI Commands…' : 'Search AI Chats…'} value={query} onChange={event => { setQuery(event.target.value); setSelected(0); }} /> : <strong>{view === 'chat' ? 'AI Chat' : 'Create AI Command'}</strong>}
        {view === 'root' && <button className="rc-quick-ai" title="Open Quick AI" aria-label="Open Quick AI" onClick={() => newChat(query)}>Quick AI <kbd>⇥</kbd></button>}
      </header>
      {error && <div className="rc-error" role="alert">{error} <button title="Refresh saved state" onClick={() => refresh().then(() => setError('')).catch(report)}>Refresh</button></div>}
      {['root', 'commands', 'history'].includes(view) && <div id="rc-results" role="listbox" aria-label="Commands" className="rc-results">
        <div className="rc-section">{query ? 'Results' : view === 'root' ? 'Suggestions' : view === 'history' ? 'AI Chats' : 'AI Commands'}</div>
        {!loaded && <p role="status">Loading…</p>}
        {filtered.map((command, index) => <div key={command.id} role="presentation">{command.category === 'app' && filtered[index - 1]?.category !== 'app' && <div className="rc-section">Applications</div>}<LauncherCommandRow command={command} flatIndex={index} selected={selected === index} itemRef={element => { rows.current[index] = element; if (element) element.id = `rc-${index}`; }} commandAlias="" commandHotkey="" onClick={() => { setSelected(index); void run(command); }} onContextMenu={event => { event.preventDefault(); setSelected(index); setActionIndex(0); setMenu(true); }} t={key => key} /></div>)}
        {loaded && !filtered.length && <div className="rc-empty">No results found.<button title="Create AI Command" onClick={() => edit()}>Create AI Command</button></div>}
      </div>}
      {view === 'chat' && <div className="rc-chat">
        <nav className="rc-chat-toolbar"><button title="Start new chat" onClick={() => newChat()}>＋ New Chat</button><button title="Search AI Chats" onClick={() => go('history')}>History</button></nav>
        {chat?.threadId ? <ThreadChat key={chat.threadId} threadId={chat.threadId} variant="compact" layout="contained" permissionPolicy="inherit" /> : chat ? <p role="alert">{chat.error ?? 'Creation is unconfirmed.'} Start a separate chat to send a different request.</p> : loaded && <div className="rc-new-chat"><div className="rc-ai-mark">✦</div><h1>How can I help you?</h1>
          {seed.includes('{selection}') && <label>Input text<textarea aria-label="AI Command input" value={commandInput} onChange={event => setCommandInput(event.target.value)} /><small>Only text entered here is shared.</small></label>}
          <NewThreadComposer key={seed + commandInput} initialPrompt={seed.replaceAll('{selection}', commandInput)} draftKey="vv-raycast-new-chat" defaultProjectId={state.personalProjectId} defaultProviderId="codex" defaultModel="gpt-6.1-sol" defaultReasoningLevel="medium" defaultServiceTier="default" defaultPermissionMode="auto" placeholder="Ask AI anything…" layout="document" onSubmit={send} />
        </div>}
      </div>}
      {view === 'edit' && draft && <form className="rc-form" onSubmit={async event => { event.preventDefault(); if (busy) return; setBusy(true); try { await rpc.call('saveCommand', draft); remember(`command:${draft.id}`, 'null'); await refresh(); go('commands'); } catch (cause) { report(cause); } finally { setBusy(false); } }}>
        <label>Name<input required maxLength={100} value={draft.title} onChange={event => updateDraft({ ...draft, title: event.target.value })} /></label>
        <label>Prompt<textarea required maxLength={12000} rows={7} value={draft.prompt} onChange={event => updateDraft({ ...draft, prompt: event.target.value })} /></label>
        <p>Use {'{selection}'} for text you enter when opening this command. Running it opens a draft; Send starts BB execution.</p>
        <button type="submit" title="Save AI Command" disabled={busy}>{busy ? 'Saving…' : 'Create Command'}</button>
      </form>}
      <footer className="rc-footer"><span aria-hidden="true" className="rc-logo">▧</span><small>{view === 'chat' ? 'BB server' : '↑↓ Navigate · ↵ Open · Tab Ask AI'}</small><div className="rc-footer-actions">{view === 'root' && query && <button title="Ask AI" onClick={() => newChat(query)}>Ask AI <kbd>⇥</kbd></button>}{actions.length > 0 && <button title="Show Actions" onClick={() => { setActionIndex(0); setMenu(true); }}>Actions <kbd>⌘ K</kbd></button>}</div></footer>
      {menu && <LauncherActionsOverlay actions={actions} selectedIndex={actionIndex} setSelectedIndex={setActionIndex} overlayRef={panel as React.RefObject<HTMLDivElement>} onClose={closeMenu} onActionClick={async action => { try { await action.execute(); closeMenu(); } catch (cause) { report(cause); } }} isNativeLiquidGlass={false} isGlassyTheme={false} onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape' || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k')) { event.preventDefault(); closeMenu(); } if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setActionIndex(previous => (previous + (event.key === 'ArrowDown' ? 1 : actions.length - 1)) % actions.length); } if (event.key === 'Enter') { event.preventDefault(); void Promise.resolve(actions[actionIndex]?.execute()).then(closeMenu, report); } }} />}
    </section>
  </div>;
}
export default definePluginApp(app => { app.slots.navPanel({ id: 'launcher', title: 'Raycast', icon: 'Command', path: 'launcher', component: Raycast }); });
