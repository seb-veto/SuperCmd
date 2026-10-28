import type { PluginComposerApi } from '@get-bb/plugin-sdk/app';

export type QuickIntent = { id: string; text: string; claim(): boolean; cancel(): void; report(cause: unknown): void };
export function createQuickIntent(id: string, text: string, report: (cause: unknown) => void): QuickIntent | null {
  if (!text.trim()) return null;
  let pending = true;
  return { id, text, report, claim() { if (!pending) return false; pending = false; return true; }, cancel() { pending = false; } };
}
type Composer = Pick<PluginComposerApi, 'scope' | 'text' | 'isSubmitting' | 'isSubmittingBlocked' | 'submit'>;
export function submitQuickIntent(intent: QuickIntent | null, composer: Composer): boolean {
  if (!intent || composer.scope.kind !== 'new-thread' || composer.text !== intent.text || composer.isSubmitting || composer.isSubmittingBlocked || !intent.claim()) return false;
  try { void composer.submit({ experimental_data: { raycastQuickIntent: intent.id } }).catch(intent.report); }
  catch (cause) { intent.report(cause); }
  return true;
}
