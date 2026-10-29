import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useComposer, experimental_ProviderModelPicker as ModelPicker } from '@get-bb/plugin-sdk/app';

import { settingsRouting } from './settings-routing';

type Settings = { chat?: { id: string; title: string; rename(title: string, expectedTitle: string): Promise<void> }; target: HTMLElement | null; environmentId?: string; close(): void; report(error: unknown): void };
export const ChatSettingsContext = createContext<Settings | null>(null);

export function ChatSettingsBridge() {
  const settings = useContext(ChatSettingsContext);
  return settings ? <ChatSettings settings={settings} /> : null;
}

function ChatSettings({ settings }: { settings: Settings }) {
  const composer = useComposer();
  const [saving, setSaving] = useState(false);
  const pending = useRef(false), titlePending = useRef(false);
  const [titleState, setTitleState] = useState({ id: settings.chat?.id, base: settings.chat?.title ?? '', draft: settings.chat?.title ?? '' });
  const [titleError, setTitleError] = useState(''), [renaming, setRenaming] = useState(false);
  useEffect(() => {
    const id = settings.chat?.id, title = settings.chat?.title ?? '';
    setTitleState(old => old.id !== id || old.draft === old.base ? { id, base: title, draft: title } : old);
  }, [settings.chat?.id, settings.chat?.title]);
  const conflict = settings.chat && settings.chat.title !== titleState.base && settings.chat.title !== titleState.draft.trim();
  async function rename() {
    if (!settings.chat || titlePending.current) return;
    const target = settings.chat, title = titleState.draft.trim(), expectedTitle = titleState.base;
    titlePending.current = true; setRenaming(true); setTitleError('');
    try {
      await target.rename(title, expectedTitle);
      setTitleState(old => old.id === target.id ? { id: target.id, base: title, draft: title } : old);
    } catch (cause) { setTitleError(cause instanceof Error ? cause.message : String(cause)); }
    finally { titlePending.current = false; setRenaming(false); }
  }
  const selection = composer.selection;
  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !(event.target instanceof Node) || !settings.target?.contains(event.target)) return;
      const popup = Array.from(document.querySelectorAll('[data-bb-plugin="vv-raycast"][role="dialog"], [data-bb-plugin="vv-raycast"] [role="dialog"], [data-bb-plugin="vv-raycast"] [role="menu"], [data-bb-plugin="vv-raycast"] [role="listbox"]')).some(element => !element.closest('[inert], [aria-hidden="true"], [data-state="closed"]') && element.getClientRects().length > 0);
      if (!popup) { event.preventDefault(); event.stopPropagation(); settings.close(); }
    };
    document.addEventListener('keydown', keyDown, true);
    return () => document.removeEventListener('keydown', keyDown, true);
  }, [settings.target, settings.close]);
  if (!settings.target) return null;
  return createPortal(<aside id="rc-chat-settings" className="rc-chat-settings" aria-label="Chat settings">
    <header><h2>Chat Settings</h2><button autoFocus title="Close settings" aria-label="Close settings" aria-description="Click, press Enter or Escape to close settings." onClick={settings.close}>×</button></header>
    {settings.chat && <section><form className="rc-chat-title-form" onKeyDown={event => event.stopPropagation()} onSubmit={event => { event.preventDefault(); event.stopPropagation(); void rename(); }}><label htmlFor="rc-chat-title">Title</label><input id="rc-chat-title" aria-label="Chat title" aria-describedby="rc-title-help" maxLength={100} value={titleState.draft} disabled={renaming} onChange={event => { setTitleState(old => ({ ...old, draft: event.target.value })); setTitleError(''); }} /><p id="rc-title-help">Enter or Save renames this BB conversation. Closing settings keeps your unsaved edit while this chat stays open.</p>{(conflict || titleError) && <p role="alert">{titleError || 'The title changed elsewhere. Reload the saved title or keep your edit.'}</p>}<div><button type="button" title="Reload saved title" aria-description="Click or press Enter to discard this title edit and load the current saved title." disabled={renaming} onClick={() => { setTitleState({ id: settings.chat!.id, base: settings.chat!.title, draft: settings.chat!.title }); setTitleError(''); }}>Reload Title</button><button type="submit" title="Save chat title" aria-description="Click or press Enter in the title field to rename this conversation without sending a message." disabled={renaming || Boolean(conflict) || !titleState.draft.trim() || titleState.draft.trim() === settings.chat.title}>{renaming ? 'Saving…' : 'Save'}</button></div></form></section>}
    <section><h3>Model</h3>
      {selection?.providerId && selection.model && selection.reasoningLevel ? <ModelPicker
        value={{ providerId: selection.providerId, model: selection.model, reasoningLevel: selection.reasoningLevel, serviceTier: selection.serviceTier }}
        routing={settingsRouting(settings.environmentId, selection)}
        allowProviderChange={composer.scope.kind === 'new-thread'} disabled={saving || composer.isRunning || composer.isSubmitting}
        onChange={value => {
          if (pending.current) return;
          pending.current = true; setSaving(true);
          void (async () => {
            try { await composer.setSelection(value); } catch (error) { settings.report(error); }
            finally { pending.current = false; setSaving(false); }
          })();
        }} /> : <p role="status">Loading model settings…</p>}
      <p>Choose a model, reasoning effort and service tier for your next message. Changes apply through BB.</p>
    </section>
    <section><h3>Execution</h3><dl><dt>Permissions</dt><dd>{selection?.permissionMode ?? 'Inherited from BB'}</dd><dt>Engine</dt><dd>BB server</dd></dl><p>Use the composer’s permission control to review access before sending.</p></section>
    <p className="rc-settings-help">Click a control or use Tab and Enter. Escape closes this sidebar.</p>
  </aside>, settings.target!);
}
