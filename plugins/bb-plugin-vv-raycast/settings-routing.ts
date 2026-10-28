import type { ComposerSelection, ExperimentalProviderModelPickerRouting } from '@get-bb/plugin-sdk/app';

export function settingsRouting(environmentId: string | undefined, selection: ComposerSelection | null): ExperimentalProviderModelPickerRouting | undefined {
  if (environmentId) return { kind: 'environment', environmentId };
  const environment = selection?.environment;
  if (environment?.type === 'reuse') return { kind: 'environment', environmentId: environment.environmentId };
  const hostId = environment?.type === 'host' ? environment.hostId : environment?.type === 'provider' && environment.machine?.type === 'existing' ? environment.machine.hostId : undefined;
  return hostId ? { kind: 'host', hostId } : undefined;
}
