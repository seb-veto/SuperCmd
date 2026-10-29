import type { CommandInfo } from './types';
import { normalizeRootSearchText, scoreRootSearchFields, type MatchKind } from './vendor/root-search-match.ts';

type Usage = { score: number; at: number; inputs: Record<string, { score: number; at: number }> };
export type RootPreferences = { aliases: Record<string, string>; usage: Record<string, Usage> };
const DAY = 86400000;
const own = <T>(map: Record<string, T>, key: string): T | undefined => Object.hasOwn(map, key) ? map[key] : undefined;
const validNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
export const rootKey = (item: CommandInfo) => item.file ? `file:${item.file.path}` : item.id;
export const rootAlias = (preferences: RootPreferences, id: string) => own(preferences.aliases, id) ?? '';

export function readRootPreferences(raw: string): RootPreferences {
  const clean: RootPreferences = { aliases: {}, usage: {} };
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object') return clean;
    if (value.aliases && typeof value.aliases === 'object') clean.aliases = Object.fromEntries(Object.entries(value.aliases).filter(([id, alias]) => id.length <= 4096 && typeof alias === 'string' && /^[a-z0-9 ]{1,40}$/.test(alias)).slice(0, 500)) as Record<string, string>;
    if (value.usage && typeof value.usage === 'object') {
      clean.usage = Object.fromEntries(Object.entries(value.usage).filter(([id, entry]) => id.length <= 4096 && entry && typeof entry === 'object' && validNumber((entry as Usage).score) && validNumber((entry as Usage).at)).slice(0, 500).map(([id, entry]) => {
        const usage = entry as Usage;
        const inputs = usage.inputs && typeof usage.inputs === 'object' ? Object.entries(usage.inputs).filter(([query, input]) => query.length <= 120 && input && validNumber(input.score) && validNumber(input.at)).slice(0, 24) : [];
        return [id, { score: Math.min(1e6, usage.score), at: usage.at, inputs: Object.fromEntries(inputs) }];
      }));
    }
  } catch { /* Invalid local settings leave commands reachable. */ }
  return clean;
}

export function assignRootAlias(preferences: RootPreferences, id: string, alias: string): RootPreferences {
  const text = alias.trim().toLowerCase();
  if (text.length > 40 || (text && !/^[a-z0-9 ]+$/.test(text))) throw new Error('Use letters a–z, numbers and spaces, up to 40 characters.');
  const normalized = text;
  if (text && Object.entries(preferences.aliases).some(([key, value]) => key !== id && value === normalized)) throw new Error('That alias belongs to another item. Choose a different alias.');
  const aliases = { ...preferences.aliases, [id]: text };
  if (!text) delete aliases[id];
  if (Object.keys(aliases).length > 500) throw new Error('Alias limit reached. Remove an unused alias first.');
  return { ...preferences, aliases };
}

const decay = (score: number, at: number, now: number, days: number) => score * Math.pow(0.5, Math.max(0, now - at) / (days * DAY));
export function recordRootLaunch(preferences: RootPreferences, id: string, query: string, now = Date.now()): RootPreferences {
  const old = own(preferences.usage, id), inputKey = normalizeRootSearchText(query).slice(0, 120);
  const inputs = { ...old?.inputs };
  if (inputKey) { const previous = own(inputs, inputKey); inputs[inputKey] = { score: Math.min(1e6, 1 + (previous ? decay(previous.score, previous.at, now, 14) : 0)), at: now }; }
  const recentInputs = Object.fromEntries(Object.entries(inputs).sort((a, b) => b[1].at - a[1].at).slice(0, 24));
  const usage = { ...preferences.usage, [id]: { score: Math.min(1e6, 1 + (old ? decay(old.score, old.at, now, 30) : 0)), at: now, inputs: recentInputs } };
  return { ...preferences, usage: Object.fromEntries(Object.entries(usage).sort((a, b) => b[1].at - a[1].at).slice(0, 500)) };
}
export function resetRootRanking(preferences: RootPreferences, id: string): RootPreferences {
  const usage = { ...preferences.usage }; delete usage[id]; return { ...preferences, usage };
}
export function moveRootFavorite(favorites: string[], id: string, direction: -1 | 1): string[] {
  const from = favorites.indexOf(id), to = from + direction;
  if (from < 0 || to < 0 || to >= favorites.length) return favorites;
  const next = [...favorites]; [next[from], next[to]] = [next[to], next[from]]; return next;
}
function learnedScore(preferences: RootPreferences, id: string, query: string, now: number) {
  const entry = own(preferences.usage, id);
  if (!entry) return 0;
  const input = own(entry.inputs, normalizeRootSearchText(query).slice(0, 120));
  return Math.min(60, Math.log1p(decay(entry.score, entry.at, now, 30)) * 15) + (input ? Math.min(80, decay(input.score, input.at, now, 14) * 20) : 0);
}
const kinds: Record<MatchKind, number> = { exact: 8, 'alias-exact': 8, 'nickname-exact': 8, prefix: 7, 'token-prefix': 6, 'compact-prefix': 5, 'word-boundary-fuzzy': 4, contains: 3, subsequence: 2, description: 1, path: 1, url: 1 };
export function rankRootCommands(items: CommandInfo[], query: string, preferences: RootPreferences, favorites: string[], root = true, now = Date.now()): CommandInfo[] {
  const normalized = query.trim().toLowerCase();
  const scored = items.flatMap((item, index) => {
    const id = rootKey(item), alias = rootAlias(preferences, id);
    const title = scoreRootSearchFields(query, [{ value: item.title, kind: 'label' }]);
    const secondary = scoreRootSearchFields(query, [{ value: item.subtitle, kind: 'description' }, { value: item.path, kind: 'path' }]);
    const aliasTier = root && normalized && alias ? alias === normalized ? 3 : alias.startsWith(normalized) ? 2 : 0 : 0;
    // shortcut: file and body-note hits are already filtered by their authoritative searches; richer match metadata can replace this fallback.
    const external = item.category === 'file' || item.category === 'note';
    if (query.trim() && !aliasTier && !title.matched && !secondary.matched && !external && item.category !== 'calculator' && !item.url) return [];
    const favorite = root && !query.trim() ? favorites.indexOf(id) : -1;
    return [{ item, index, favorite, calculator: item.category === 'calculator', tier: aliasTier || (title.matched ? 1 : 0), kind: title.matched ? kinds[title.matchKind] : 0, score: (title.matched ? title.matchScore : secondary.matchScore) + (root ? learnedScore(preferences, id, query, now) : 0) }];
  });
  scored.sort((a, b) => {
    if (!query.trim()) return (a.favorite < 0 ? 1 : 0) - (b.favorite < 0 ? 1 : 0) || (a.favorite >= 0 && b.favorite >= 0 ? a.favorite - b.favorite : 0) || Number(b.item.quicklink?.pinned ?? false) - Number(a.item.quicklink?.pinned ?? false) || b.score - a.score || a.index - b.index;
    return Number(Boolean(b.item.url)) - Number(Boolean(a.item.url)) || Number(b.calculator) - Number(a.calculator) || b.tier - a.tier || b.kind - a.kind || b.score - a.score || a.index - b.index;
  });
  return scored.map(result => result.item);
}

export function selectedRootIndex(ids: string[], selection: { query: string; view: string; id?: string }, query: string, view: string) {
  return selection.query === query && selection.view === view ? Math.max(0, ids.indexOf(selection.id ?? '')) : 0;
}
