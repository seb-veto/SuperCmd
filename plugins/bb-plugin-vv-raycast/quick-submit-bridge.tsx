import { createContext, useContext, useEffect } from 'react';
import { useComposer } from '@get-bb/plugin-sdk/app';
import { submitQuickIntent, type QuickIntent } from './quick-submit';

export const QuickSubmitContext = createContext<QuickIntent | null>(null);
export function QuickSubmitBridge() {
  const intent = useContext(QuickSubmitContext);
  return intent ? <QuickSubmitAttempt intent={intent} /> : null;
}
function QuickSubmitAttempt({ intent }: { intent: QuickIntent }) {
  const composer = useComposer();
  useEffect(() => { submitQuickIntent(intent, composer); }, [intent, composer, composer.text, composer.isSubmitting, composer.isSubmittingBlocked]);
  return null;
}
