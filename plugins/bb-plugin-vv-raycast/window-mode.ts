export type WindowMode = 'standard' | 'compact';
export const readWindowMode = (value: string | null): WindowMode => value === 'compact' ? 'compact' : 'standard';

export function collapsedRoot(view: string, mode: WindowMode, query: string, menu: boolean, suggestions: boolean) {
  return view === 'root' && mode === 'compact' && query === '' && !menu && !suggestions;
}

export function expandsCompactRoot(key: string, modified: boolean) {
  return ['Enter', 'ArrowDown', 'ArrowUp'].includes(key) || (modified && /^[1-9]$/.test(key));
}
