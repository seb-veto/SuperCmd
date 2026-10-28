import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { NewThreadRequest } from '@get-bb/plugin-sdk';
import { definePluginApp, useRpc, useRealtime, ThreadChat, experimental_copyToClipboard, experimental_NewThreadComposer as NewThreadComposer } from '@get-bb/plugin-sdk/app';
import type { Calculation } from './calculator';
import type { FileResult } from './files';
import LauncherCalculatorCard from './vendor/LauncherCalculatorCard';
import type { contract, Chat, SavedCommand } from './contract';
import type { CommandInfo } from './types';
import type { LauncherAction } from './command-helpers';
import LauncherCommandRow from './vendor/LauncherCommandRow';
import LauncherActionsOverlay from './vendor/LauncherActionsOverlay';
import { ChatSidebar } from './chat-sidebar';
import { experimental_Icon as Icon } from '@get-bb/plugin-sdk/app';
import { createQuickIntent, type QuickIntent } from './quick-submit';
import { QuickSubmitBridge, QuickSubmitContext } from './quick-submit-bridge';
import { ChatSettingsBridge, ChatSettingsContext } from './chat-settings';
import './style.css';

const remember = (key: string, value: string) => { try { localStorage.setItem(`vv-raycast:${key}`, value); } catch {} };
const restore = (key: string, fallback = '') => { try { return localStorage.getItem(`vv-raycast:${key}`) ?? fallback; } catch { return fallback; } };
type View = 'root' | 'chat' | 'quick' | 'commands' | 'edit' | 'history' | 'files';
function Raycast() {
  const rpc = useRpc<typeof contract>();
  const [quickIntent, setQuickIntent] = useState<QuickIntent | null>(null);
  useEffect(() => () => quickIntent?.cancel(), [quickIntent]);
  const [state, setState] = useState<{ commands: SavedCommand[]; chats: Chat[]; personalProjectId?: string }>({ commands: [], chats: [] });
  const [apps, setApps] = useState<CommandInfo[]>([]), [error, setError] = useState('');
  const [appIcons, setAppIcons] = useState<Record<string, string | null>>({});
  const [calculation, setCalculation] = useState<Calculation | null>(null), [files, setFiles] = useState<FileResult[]>([]);
  const [fileIndexing, setFileIndexing] = useState(false), [fileIndexLimited, setFileIndexLimited] = useState(false);
  const [fileSearchBusy, setFileSearchBusy] = useState(false), [fileError, setFileError] = useState(''), [notice, setNotice] = useState('');
  const [fileDetails, setFileDetails] = useState(false), [searchRevision, setSearchRevision] = useState(0);
  const iconRequests = useRef(new Map<string, Promise<string | null>>());
  const results = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>(() => { const saved = restore('view'); return saved === 'chat' || saved === 'quick' ? saved : 'root'; });
  const [query, setQuery] = useState(''), [selected, setSelected] = useState(0), [menu, setMenu] = useState(false), [actionIndex, setActionIndex] = useState(0);
  const [actionQuery, setActionQuery] = useState('');
  const [active, setActive] = useState<string | null>(() => restore('chat') || null), [seed, setSeed] = useState(() => restore('seed')), [busy, setBusy] = useState(false);
  const [composerId, setComposerId] = useState(() => restore('composer-id') || crypto.randomUUID());
  const [loaded, setLoaded] = useState(false), [draft, setDraft] = useState<SavedCommand | null>(null), [commandInput, setCommandInput] = useState(() => restore('command-input'));
  const [inputReady, setInputReady] = useState(() => restore('input-ready') === 'true');
  const [needsInput, setNeedsInput] = useState(() => restore('needs-input') === 'true');
  const [chatSidebar, setChatSidebar] = useState(() => restore('chat-sidebar', 'open') !== 'closed');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTarget, setSettingsTarget] = useState<HTMLDivElement | null>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const closeSettings = useCallback(() => { setSettingsOpen(false); settingsButton.current?.focus(); }, []);
  const [chatFocus, setChatFocus] = useState(0), [rename, setRename] = useState<string | null>(null);
  const renameDialog = useRef<HTMLDialogElement>(null);
  const popupEscape = useRef<Event | null>(null);
  const [favorites, setFavorites] = useState<string[]>(() => { try { const value: unknown = JSON.parse(restore('favorites', '[]')); return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string').slice(0, 100) : []; } catch { return []; } });
  const [theme, setTheme] = useState(() => restore('theme', 'dark') === 'light' ? 'light' : 'dark');
  const search = useRef<HTMLInputElement>(null), panel = useRef<HTMLDivElement>(null), rows = useRef<(HTMLDivElement | null)[]>([]);
  const report = useCallback((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)), []);
  const refresh = useCallback(async () => { const result = await rpc.call('state'); setState(result); setLoaded(true); }, [rpc]);
  useEffect(() => { refresh().catch(report); rpc.call('apps').then(result => setApps(result.map(app => ({ ...app, category: 'app' }))), report); }, [rpc, refresh, report]);
  useRealtime('changed', () => { refresh().catch(report); });
  useEffect(() => {
    setCalculation(null); setFiles([]); setFileError(''); setNotice(''); setFileSearchBusy(false); setFileIndexing(false); setFileIndexLimited(false);
    if (!['root', 'files'].includes(view)) return;
    const expression = query.trim();
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => {
      if (view === 'root' && expression.length <= 240) rpc.call('calculate', { expression }).then(value => { if (!cancelled) setCalculation(value); }, report);
      if ((view === 'files' || expression.length >= 2) && expression.length <= 200) {
        setFileSearchBusy(true);
        const find = () => {
          rpc.call('files', { query: expression }).then(value => {
            if (cancelled) return;
            setFiles(value.files); setFileIndexing(value.indexing); setFileIndexLimited(value.indexLimited); setFileSearchBusy(false);
            if (value.indexing) retry = setTimeout(find, 1500);
          }, cause => { if (!cancelled) { setFileError(cause instanceof Error ? cause.message : String(cause)); setFileSearchBusy(false); setFileIndexing(false); } });
        };
        find();
      }
    }, 180);
    return () => { cancelled = true; clearTimeout(timer); clearTimeout(retry); };
  }, [query, view, rpc, report, searchRevision]);
  useEffect(() => { remember('view', view); }, [view]);
  useEffect(() => { remember('chat', active ?? ''); }, [active]);
  useEffect(() => { remember('composer-id', composerId); }, [composerId]);
  useEffect(() => { remember('seed', seed); remember('command-input', commandInput); remember('input-ready', String(inputReady)); remember('needs-input', String(needsInput)); }, [seed, commandInput, inputReady, needsInput]);
  useEffect(() => { remember('favorites', JSON.stringify(favorites)); }, [favorites]);
  useEffect(() => { remember('theme', theme); }, [theme]);
  useEffect(() => { remember('chat-sidebar', chatSidebar ? 'open' : 'closed'); }, [chatSidebar]);
  useEffect(() => {
    const narrow = window.matchMedia('(max-width: 700px)');
    const collapse = () => { if (narrow.matches) setChatSidebar(false); };
    collapse(); narrow.addEventListener('change', collapse);
    return () => narrow.removeEventListener('change', collapse);
  }, []);
  useEffect(() => {
    const dialog = renameDialog.current;
    if (rename !== null && dialog && !dialog.open) dialog.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, [rename !== null]);
  useEffect(() => { if (menu) { setActionQuery(''); setActionIndex(0); panel.current?.querySelector('input')?.focus(); } }, [menu]);
  useEffect(() => { if (['root', 'commands', 'history', 'files'].includes(view)) search.current?.focus(); }, [view]);
  useEffect(() => { rows.current[selected]?.scrollIntoView({ block: 'nearest' }); }, [selected]);
  useEffect(() => {
    if (!results.current) return;
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        const path = (entry.target as HTMLElement).dataset.appPath;
        if (!path || iconRequests.current.has(path)) continue;
        const request = rpc.call('appIcon', { path });
        iconRequests.current.set(path, request);
        request.then(icon => setAppIcons(previous => ({ ...previous, [path]: icon })), () => { iconRequests.current.delete(path); });
      }
    }, { root: results.current, rootMargin: '80px' });
    results.current.querySelectorAll('[data-app-path]').forEach(element => observer.observe(element));
    return () => observer.disconnect();
  }, [rpc, apps.length, query, view]);
  const conversation = view === 'chat' || view === 'quick';
  const closeMenu = () => { setMenu(false); setActionQuery(''); if (conversation) setChatFocus(value => value + 1); else search.current?.focus(); };
  function go(next: View) { if (next !== 'quick' && next !== 'chat') { quickIntent?.cancel(); setQuickIntent(null); } setSettingsOpen(false); setMenu(false); setView(next); setQuery(''); setSelected(0); setError(''); }
  function newChat(prompt = '', surface: 'chat' | 'quick' = 'chat', submit = false) { const id = crypto.randomUUID(); quickIntent?.cancel(); setQuickIntent(submit ? createQuickIntent(id, prompt, report) : null); setActive(null); setSeed(prompt); setDraft(null); setNeedsInput(false); setCommandInput(''); setInputReady(false); setComposerId(id); go(surface); }
  function edit(command?: SavedCommand) {
    const fresh = command ?? { id: crypto.randomUUID(), title: '', prompt: '', revision: 0 };
    try { const saved = JSON.parse(restore(`command:${fresh.id}`, 'null')); setDraft(saved?.id === fresh.id && typeof saved.title === 'string' && typeof saved.prompt === 'string' && Number.isInteger(saved.revision) ? saved : fresh); } catch { setDraft(fresh); }
    go('edit');
  }
  const fileItems: CommandInfo[] = files.map(file => ({ id: `file:${file.id}`, title: file.title, subtitle: file.subtitle, category: 'file', path: file.path, file }));
  const catalog: CommandInfo[] = view === 'history' ? state.chats.map(chat => ({ id: `chat:${chat.id}`, title: chat.title, subtitle: 'AI Chat', category: 'extension' })) : view === 'files' ? fileItems : [
    ...(view === 'root' && calculation ? [{ id: 'calculator', title: calculation.result, category: 'calculator' as const }] : []),
    ...(view === 'root' ? [
      { id: 'ai', title: 'AI Chat', subtitle: 'Raycast AI', category: 'extension' as const, iconEmoji: '✦' },
      { id: 'quick-ai', title: 'Quick AI', subtitle: 'Raycast AI', category: 'extension' as const, iconEmoji: '✦' },
      { id: 'commands', title: 'Search AI Commands', subtitle: 'Raycast AI', category: 'extension' as const, iconEmoji: '⌘' },
      { id: 'create', title: 'Create AI Command', subtitle: 'Raycast AI', category: 'extension' as const, iconEmoji: '＋' },
      { id: 'history', title: 'Search AI Chats', subtitle: 'Raycast AI', category: 'extension' as const, iconEmoji: '◷' },
      { id: 'files', title: 'Search Files', subtitle: 'File Search', category: 'extension' as const, iconEmoji: '⌕' },
    ] : []),
    ...state.commands.map(command => ({ id: `command:${command.id}`, title: command.title, subtitle: 'AI Command', category: 'extension' as const })),
    ...(view === 'root' ? apps.map(app => ({ ...app, iconDataUrl: appIcons[app.path ?? ''] ?? undefined })) : []),
    ...(view === 'root' ? fileItems : []),
  ];
  const filtered = catalog.filter(item => ['file', 'calculator'].includes(item.category) || `${item.title} ${item.subtitle ?? ''}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => Number(favorites.includes(b.id)) - Number(favorites.includes(a.id)));
  const item = filtered[selected];
  async function copy(text: string) { if (!await experimental_copyToClipboard({ text })) throw new Error('Clipboard is unavailable.'); setNotice('Copied to clipboard'); }
  async function openFile(file: FileResult, reveal = false) {
    setBusy(true); setError('');
    try { await rpc.call('openFile', { id: file.id, reveal }); }
    catch (cause) { report(cause); throw cause; }
    finally { setBusy(false); }
  }
  async function run(command: CommandInfo) {
    if (busy) return;
    if (command.category === 'calculator' && calculation) { await copy(calculation.result).catch(report); }
    else if (command.file) { await openFile(command.file).catch(() => {}); }
    else if (command.category === 'app' && command.path) {
      setBusy(true); try { await rpc.call('openApp', { path: command.path }); } catch (cause) { report(cause); } finally { setBusy(false); }
    } else if (command.id === 'ai') newChat(query);
    else if (command.id === 'quick-ai') newChat('', 'quick');
    else if (command.id === 'commands') go('commands');
    else if (command.id === 'create') edit();
    else if (command.id === 'history') go('history');
    else if (command.id === 'files') { go('files'); setFileDetails(true); }
    else if (command.id.startsWith('chat:')) { setActive(command.id.slice(5)); go('chat'); }
    else if (command.id.startsWith('command:')) {
      const saved = state.commands.find(row => row.id === command.id.slice(8));
      if (saved) { setCommandInput(''); setInputReady(false); setNeedsInput(saved.prompt.includes('{selection}')); setDraft(saved); setComposerId(crypto.randomUUID()); go('chat'); setActive(null); setSeed(saved.prompt); }
    }
  }
  const chat = state.chats.find(row => row.id === active);
  async function chatAction(action: 'pin' | 'unpin' | 'archive' | 'unarchive' | 'rename', title?: string) {
    if (!chat || busy) return;
    setBusy(true);
    try { await rpc.call('chatAction', { id: chat.id, action, ...(title === undefined ? {} : { title }) }); await refresh(); setError(''); }
    catch (cause) { report(cause); await refresh().catch(report); throw cause; }
    finally { setBusy(false); }
  }
  const actions: LauncherAction[] = conversation ? [
    { id: 'new-chat', title: 'New Chat', shortcut: 'Cmd+N', execute: () => newChat('', view === 'quick' ? 'quick' : 'chat') },
    ...(view === 'quick' ? [{ id: 'continue-chat', title: 'Continue in AI Chat', shortcut: 'Cmd+J', execute: () => go('chat') }] : []),
    ...(chat?.threadId ? [
      { id: 'pin-chat', title: chat.pinned ? 'Unpin Chat' : 'Pin Chat', execute: () => chatAction(chat.pinned ? 'unpin' : 'pin') },
      { id: 'rename-chat', title: 'Rename Chat', execute: () => setRename(chat.title) },
      { id: 'archive-chat', title: chat.archived ? 'Restore Chat' : 'Archive Chat', execute: () => chatAction(chat.archived ? 'unarchive' : 'archive') },
    ] : []),
    { id: 'appearance', title: 'Toggle Appearance', separatorBefore: true, execute: () => setTheme(previous => previous === 'dark' ? 'light' : 'dark') },
  ] : item?.category === 'calculator' && calculation ? [
    { id: 'copy', title: 'Copy Answer', shortcut: 'Enter', execute: () => copy(calculation.result) },
    { id: 'copy-expression', title: 'Copy Question and Answer', execute: () => copy(`${calculation.input} = ${calculation.result}`) },
  ] : item?.file ? [
    { id: 'open-file', title: item.file.directory ? 'Open Folder' : 'Open File', shortcut: 'Enter', execute: () => openFile(item.file!) },
    { id: 'reveal-file', title: 'Show in Finder', shortcut: 'Cmd+Enter', execute: () => openFile(item.file!, true) },
    { id: 'copy-path', title: 'Copy File Path', execute: () => copy(item.file!.path) },
    { id: 'details', title: fileDetails && view === 'files' ? 'Hide Details' : 'Show File Details', execute: () => { setFileDetails(previous => view === 'files' ? !previous : true); if (view !== 'files') setSelected(fileItems.findIndex(row => row.id === item.id)); setView('files'); } },
  ] : item && view !== 'edit' ? [
    { id: 'open', title: item.category === 'app' ? 'Open Application' : 'Open Command', shortcut: 'Enter', execute: () => run(item) },
    { id: 'favorite', title: favorites.includes(item.id) ? 'Remove from Favorites' : 'Add to Favorites', shortcut: 'Cmd+F', execute: () => setFavorites(previous => previous.includes(item.id) ? previous.filter(id => id !== item.id) : [...previous, item.id]) },
    ...(item.id.startsWith('command:') ? [{ id: 'edit', title: 'Edit AI Command', shortcut: 'Cmd+E', execute: () => edit(state.commands.find(row => row.id === item.id.slice(8))) }] : []),
    { id: 'theme', title: 'Toggle Appearance', separatorBefore: true, execute: () => setTheme(previous => previous === 'dark' ? 'light' : 'dark') },
  ] : [];
  const visibleActions = actions.filter(action => action.title.toLocaleLowerCase().includes(actionQuery.toLocaleLowerCase()));
  function keyDown(event: KeyboardEvent) {
    if (rename !== null) return;
    if (event.nativeEvent === popupEscape.current) return;
    if (event.defaultPrevented) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && ['root', 'commands', 'history', 'chat', 'quick', 'files'].includes(view)) { event.preventDefault(); if (menu) closeMenu(); else { setActionIndex(0); setMenu(true); } return; }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n' && conversation) { event.preventDefault(); newChat('', view === 'quick' ? 'quick' : 'chat'); return; }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'j' && view === 'quick') { event.preventDefault(); go('chat'); return; }
    if (menu) return;
    if (event.key === 'Escape') { event.preventDefault(); if (settingsOpen) { closeSettings(); return; } if (query) setQuery(''); else go('root'); search.current?.focus(); return; }
    if (event.target !== search.current) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setSelected(previous => Math.max(0, Math.min(filtered.length - 1, previous + (event.key === 'ArrowDown' ? 1 : -1)))); }
    if (event.key === 'Enter' && item) { event.preventDefault(); if ((event.metaKey || event.ctrlKey) && item.file) void openFile(item.file, true).catch(() => {}); else void run(item); }
    if (event.key === 'Tab' && view === 'root' && !event.shiftKey) { event.preventDefault(); newChat(query, 'quick', true); }
    if ((event.metaKey || event.ctrlKey) && /^[1-9]$/.test(event.key)) { event.preventDefault(); const command = filtered[Number(event.key) - 1]; if (command) void run(command); }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') { const favorite = actions.find(action => action.id === 'favorite'); if (favorite) { event.preventDefault(); void favorite.execute(); } }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'e' && item?.id.startsWith('command:')) { event.preventDefault(); edit(state.commands.find(row => row.id === item.id.slice(8))); }
  }
  async function send(request: NewThreadRequest) {
    if (busy) throw new Error('A send is already pending.');
    setBusy(true); setError('');
    try {
      remember('composer-id', composerId);
      if (restore('composer-id') !== composerId) throw new Error('Cannot preserve this draft’s send identity. Enable local storage before sending.');
      const chat = await rpc.call('start', { id: composerId, request }); setActive(chat.id); await refresh(); }
    catch (cause) { report(cause); await refresh().catch(report); throw cause; }
    finally { setBusy(false); }
  }
  function updateDraft(value: SavedCommand) { setDraft(value); remember(`command:${value.id}`, JSON.stringify(value)); }
  function captureKeyDown(event: KeyboardEvent) {
    if (rename !== null) return;
    const shortcut = (event.metaKey || event.ctrlKey) && ['k', 'j', 'n'].includes(event.key.toLowerCase());
    // Let native pickers consume Escape before handling the enclosing conversation.
    const popupOpen = Array.from(document.querySelectorAll('[role="dialog"], [role="menu"], [role="listbox"]')).some(element => element !== results.current && !element.closest('[inert], [aria-hidden="true"], [data-state="closed"]') && element.getClientRects().length > 0);
    if (event.key === 'Escape' && popupOpen) popupEscape.current = event.nativeEvent;
    if (shortcut || (conversation && event.key === 'Escape' && !popupOpen)) { keyDown(event); if (event.defaultPrevented) event.stopPropagation(); }
  }
  return <div className={`vv-raycast-page ${theme}`} onKeyDown={keyDown} onKeyDownCapture={captureKeyDown}>
    <section className={`rc-window ${view === 'chat' ? 'rc-chat-window' : view === 'quick' ? 'rc-quick-window' : ''}`} aria-label="Raycast launcher">
      {view === 'chat' && chatSidebar && <ChatSidebar chats={state.chats} selected={active} onSelect={chat => { setActive(chat.id); setChatFocus(value => value + 1); }} onNew={() => newChat()} onHide={() => setChatSidebar(false)} onActions={chat => { setActive(chat.id); setActionIndex(0); setMenu(true); }} />}
      <div className="rc-window-content">
      <header className="rc-search">
        {view === 'root' && <Icon name="vv-raycast/mark" className="rc-search-mark" aria-hidden="true" />}
        {view !== 'root' && <button aria-label="Back to Root Search" title="Back to Root Search" onClick={() => go('root')}>‹</button>}
        {view === 'chat' && !chatSidebar && <button title="Show chat history" aria-label="Show chat history" onClick={() => setChatSidebar(true)}><Icon name="PanelLeft" className="rc-icon" /></button>}
        {['root', 'commands', 'history', 'files'].includes(view) ? <input ref={search} role="combobox" aria-label={view === 'root' ? 'Search for apps or commands' : view === 'commands' ? 'Search AI Commands' : view === 'files' ? 'Search files and folders' : 'Search AI Chats'} aria-expanded="true" aria-controls="rc-results" aria-activedescendant={item ? `rc-${selected}` : undefined} placeholder={view === 'root' ? 'Search for apps or commands…' : view === 'commands' ? 'Search AI Commands…' : view === 'files' ? 'Search files and folders…' : 'Search AI Chats…'} value={query} onChange={event => { setQuery(event.target.value); setSelected(0); }} /> : <div className="rc-chat-heading"><strong>{conversation ? view === 'quick' ? 'Quick AI' : chat?.title || 'New Chat' : draft?.revision ? 'Edit AI Command' : 'Create AI Command'}</strong>{conversation && chat?.model && <small>{chat.model}</small>}</div>}
        {view === 'quick' && <button className="rc-continue-chat" title="Continue in AI Chat" aria-description="Click or press Command J to expand this conversation." onClick={() => go('chat')}>AI Chat <kbd>⌘ J</kbd></button>}
        {conversation && <><button title="Start new chat" aria-label="Start new chat" onClick={() => newChat('', view === 'quick' ? 'quick' : 'chat')}><Icon name="Edit" className="rc-icon" /></button><button ref={settingsButton} disabled={Boolean(chat && (!chat.threadId || chat.unavailable)) || (needsInput && !inputReady)} title="Chat settings" aria-label="Chat settings" aria-expanded={settingsOpen} aria-controls="rc-chat-settings" aria-description="Click or press Enter to change the model. Escape closes settings." onClick={() => setSettingsOpen(value => !value)}><Icon name="SlidersHorizontal" className="rc-icon" /></button></>}
        {view === 'root' && <button className="rc-quick-ai" title={query.trim() ? 'Ask Quick AI' : 'Open Quick AI'} aria-label={query.trim() ? 'Ask Quick AI' : 'Open Quick AI'} aria-description="Click or press Tab to ask BB. With no text, opens an empty draft." onClick={() => newChat(query, 'quick', true)}>Quick AI <kbd>⇥</kbd></button>}
      </header>
      {error && <div className="rc-error" role="alert">{error} <button title="Refresh saved state" onClick={() => refresh().then(() => { setError(''); if (view === 'root' || view === 'files') { setSelected(0); setSearchRevision(value => value + 1); search.current?.focus(); } }).catch(report)}>Refresh</button></div>}
      {['root', 'commands', 'history', 'files'].includes(view) && <div className="rc-search-body"><div ref={results} id="rc-results" role="listbox" aria-label={view === 'files' ? 'Files' : 'Commands'} className="rc-results">
        <div className="rc-section">{query ? 'Results' : view === 'root' ? 'Suggestions' : view === 'history' ? 'AI Chats' : view === 'files' ? 'Recently Used' : 'AI Commands'}</div>
        {!loaded && <p role="status">Loading…</p>}
        {filtered.map((command, index) => <div key={command.id} role="presentation" data-app-path={command.category === 'app' ? command.path : undefined}>{command.category === 'app' && filtered[index - 1]?.category !== 'app' && <div className="rc-section">Applications</div>}{command.category === 'file' && filtered[index - 1]?.category !== 'file' && <div className="rc-section">Files</div>}{command.category === 'calculator' && calculation ? <LauncherCalculatorCard result={calculation} selected={selected === index} itemRef={element => { rows.current[index] = element; if (element) element.id = `rc-${index}`; }} onCopy={() => void copy(calculation.result).catch(report)} t={key => key.endsWith('pressEnterToCopy') ? 'Press Enter to copy' : key.endsWith('clickToCopy') ? 'Click to copy' : 'Copy'} /> : <LauncherCommandRow command={command} flatIndex={index} selected={selected === index} itemRef={element => { rows.current[index] = element; if (element) element.id = `rc-${index}`; }} commandAlias="" commandHotkey="" onClick={() => { setSelected(index); void run(command); }} onContextMenu={event => { event.preventDefault(); setSelected(index); setActionIndex(0); setMenu(true); }} t={key => key} />}</div>)}
        {(fileSearchBusy || fileIndexing) && <p className="rc-search-status" role="status">{fileIndexing ? 'Indexing local files… Results update automatically.' : 'Searching files…'}</p>}{fileIndexLimited && <p className="rc-search-status" role="status">File index limit reached. Some files may be missing.</p>}{fileError && <p className="rc-search-status" role="alert">File Search: {fileError}</p>}
        {loaded && !filtered.length && !fileSearchBusy && !fileIndexing && <div className="rc-empty">{view === 'files' ? query ? 'No matching indexed files' : 'No recently used indexed files' : 'No results found.'}{view !== 'files' && <button title="Create AI Command" onClick={() => edit()}>Create AI Command</button>}</div>}
      </div>{view === 'files' && fileDetails && <aside className="rc-file-details" aria-label="File details">{item?.file ? <><div className="rc-file-detail-icon" aria-hidden="true">{item.file.directory ? '📁' : '📄'}</div><h2>{item.file.title}</h2><dl><dt>Where</dt><dd>{item.file.subtitle}</dd><dt>Kind</dt><dd>{item.file.directory ? 'Folder' : item.file.title.split('.').length > 1 ? item.file.title.split('.').pop()?.toUpperCase() + ' file' : 'File'}</dd><dt>Size</dt><dd>{item.file.directory ? '—' : new Intl.NumberFormat().format(item.file.size) + ' bytes'}</dd><dt>Created</dt><dd>{item.file.createdAt > 0 ? new Date(item.file.createdAt).toLocaleString() : '—'}</dd><dt>Modified</dt><dd>{new Date(item.file.modifiedAt).toLocaleString()}</dd></dl></> : <p>Select a file</p>}</aside>}</div>}
      {conversation && <ChatSettingsContext.Provider value={{ target: settingsOpen ? settingsTarget : null, environmentId: chat?.environmentId, close: closeSettings, report }}><div ref={setSettingsTarget} className="rc-settings-mount" /><div className="rc-chat">
        {chat?.threadId && !chat.unavailable ? <ThreadChat className="rc-bb-chat" key={chat.threadId} threadId={chat.threadId} variant="compact" layout="contained" permissionPolicy="inherit" focusRequest={chatFocus} /> : chat ? <p role="alert">{chat.unavailable ? 'This BB conversation is unavailable. Refresh before continuing.' : chat.error ?? 'Creation is unconfirmed.'} Your saved chat binding is retained.</p> : loaded && <div className="rc-new-chat"><div className="rc-ai-mark">✦</div><h1>How can I help you?</h1>
          {needsInput && !inputReady ? <form className="rc-command-input" onSubmit={event => { event.preventDefault(); setInputReady(true); setChatFocus(value => value + 1); }}><label>Input text<textarea autoFocus aria-label="AI Command input" value={commandInput} onChange={event => setCommandInput(event.target.value)} /><small>Only text entered here is shared.</small></label><button type="submit" title="Prepare AI Command" aria-description="Click or press Enter to prepare the prompt. Send starts BB execution.">Continue</button></form> : <div className="rc-compose-slot"><QuickSubmitContext.Provider value={quickIntent}><NewThreadComposer initialPrompt={needsInput ? seed.replaceAll('{selection}', commandInput) : seed} draftKey={`vv-raycast-composer:${composerId}`} defaultProjectId={state.personalProjectId} defaultProviderId="codex" defaultModel="gpt-6.1-sol" defaultReasoningLevel="medium" defaultServiceTier="default" defaultPermissionMode="auto" placeholder="Ask AI anything…" layout="document" focusRequest={chatFocus} onSubmit={send} /></QuickSubmitContext.Provider></div>}
        </div>}
      </div></ChatSettingsContext.Provider>}
      {view === 'edit' && draft && <form className="rc-form" onKeyDown={event => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); event.currentTarget.requestSubmit(); } }} onSubmit={async event => { event.preventDefault(); if (busy) return; setBusy(true); try { await rpc.call('saveCommand', draft); remember(`command:${draft.id}`, 'null'); await refresh(); go('commands'); } catch (cause) { report(cause); } finally { setBusy(false); } }}>
        <label>Name<input autoFocus required maxLength={100} value={draft.title} onChange={event => updateDraft({ ...draft, title: event.target.value })} /></label>
        <label>Prompt<textarea required maxLength={12000} rows={7} value={draft.prompt} onChange={event => updateDraft({ ...draft, prompt: event.target.value })} /></label>
        <p>Use {'{selection}'} for text you enter when opening this command. Running it opens a draft; Send starts BB execution.</p>
        <button type="submit" title="Save AI Command" aria-description="Click or press Command Enter to save this prompt." disabled={busy}>{busy ? 'Saving…' : draft.revision ? 'Save Command' : 'Create Command'}</button>
      </form>}
      <footer className="rc-footer" role="status"><Icon name="vv-raycast/mark" className="rc-logo" aria-hidden="true" /><small>{notice || (conversation ? 'BB server' : view === 'files' ? 'Names only · Home · Local index' : item?.category === 'calculator' ? '↵ Copy Answer' : '↑↓ Navigate · ↵ Open · Tab Ask AI')}</small><div className="rc-footer-actions">{view === 'root' && query && <button title="Ask AI" aria-description="Click or press Tab to submit this question to BB." onClick={() => newChat(query, 'quick', true)}>Ask AI <kbd>⇥</kbd></button>}{actions.length > 0 && <button title="Show Actions" onClick={() => { setActionIndex(0); setMenu(true); }}>Actions <kbd>⌘ K</kbd></button>}</div></footer>
      </div>
      {rename !== null && <dialog ref={renameDialog} className="rc-rename-dialog" aria-label="Rename Chat" onCancel={() => { setRename(null); setChatFocus(value => value + 1); }}><form onSubmit={async event => { event.preventDefault(); if (busy) return; try { await chatAction('rename', rename); setRename(null); setChatFocus(value => value + 1); } catch {} }}><label>Chat title<input autoFocus required maxLength={100} value={rename} onChange={event => setRename(event.target.value)} /></label>{error && <p role="alert" className="rc-error">{error}</p>}<div><button type="button" title="Cancel rename" onClick={() => { setRename(null); setChatFocus(value => value + 1); }}>Cancel</button><button type="submit" title="Save chat title" disabled={busy || !rename.trim()}>Save</button></div></form></dialog>}
      {menu && <LauncherActionsOverlay actions={visibleActions} query={actionQuery} onQueryChange={value => { setActionQuery(value); setActionIndex(0); }} selectedIndex={actionIndex} setSelectedIndex={setActionIndex} overlayRef={panel as React.RefObject<HTMLDivElement>} onClose={closeMenu} onActionClick={async action => { try { await action.execute(); closeMenu(); } catch (cause) { report(cause); } }} isNativeLiquidGlass={false} isGlassyTheme={false} onKeyDown={event => { event.stopPropagation(); if (event.key === 'Tab' || event.key === 'Escape' || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k')) { event.preventDefault(); closeMenu(); } if (visibleActions.length && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) { event.preventDefault(); setActionIndex(previous => (previous + (event.key === 'ArrowDown' ? 1 : visibleActions.length - 1)) % visibleActions.length); } if (event.key === 'Enter') { event.preventDefault(); const action = visibleActions[actionIndex]; if (action) void Promise.resolve(action.execute()).then(closeMenu, report); } }} />}
    </section>
  </div>;
}
export default definePluginApp(app => { app.composer.customize({ id: 'chat-settings', scopes: ['thread', 'new-thread'], banners: [{ id: 'settings', chrome: 'bare', component: ChatSettingsBridge }] }); app.composer.customize({ id: 'quick-submit', scopes: ['new-thread'], banners: [{ id: 'intent', chrome: 'bare', component: QuickSubmitBridge }] }); app.slots.navPanel({ id: 'launcher', title: 'Raycast', icon: 'vv-raycast/mark', path: 'launcher', component: Raycast }); });
