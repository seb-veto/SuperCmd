import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useComposer, experimental_ProviderModelPicker as ModelPicker } from '@get-bb/plugin-sdk/app';

import { settingsRouting } from './settings-routing';

type Settings = { target: HTMLElement | null; environmentId?: string; close(): void; report(error: unknown): void };
export const ChatSettingsContext = createContext<Settings | null>(null);

export function ChatSettingsBridge() {
  const settings = useContext(ChatSettingsContext);
  return settings?.target ? <ChatSettings settings={settings} /> : null;
}

function ChatSettings({ settings }: { settings: Settings }) {
  const composer = useComposer();
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
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
  return createPortal(<aside id="rc-chat-settings" className="rc-chat-settings" aria-label="Chat settings">
    <header><h2>Chat Settings</h2><button autoFocus title="Close settings" aria-label="Close settings" aria-description="Click, press Enter or Escape to close settings." onClick={settings.close}>×</button></header>
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
