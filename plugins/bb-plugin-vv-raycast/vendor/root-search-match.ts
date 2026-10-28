// Adapted from SuperCmd MIT root-search-ranking.ts; source/license retained in this fork.
export type MatchKind =
  | 'exact'
  | 'alias-exact'
  | 'nickname-exact'
  | 'prefix'
  | 'token-prefix'
  | 'compact-prefix'
  | 'word-boundary-fuzzy'
  | 'contains'
  | 'subsequence'
  | 'description'
  | 'path'
  | 'url';


export type RootSearchFieldKind = 'label' | 'alias' | 'nickname' | 'description' | 'path' | 'url';

export type RootSearchScoringField = {
  value: string | undefined;
  kind: RootSearchFieldKind;
  weight?: number;
};

export type RootSearchScoreResult = {
  matched: boolean;
  matchKind: MatchKind;
  matchScore: number;
};

const SEARCH_SEPARATOR_REGEX = /[^\p{L}\p{N}]+/gu;
const COMBINING_MARK_REGEX = /\p{M}/gu;

const MATCH_KIND_RANK: Record<MatchKind, number> = {
  exact: 12,
  'alias-exact': 12,
  'nickname-exact': 12,
  prefix: 11,
  'token-prefix': 10,
  'compact-prefix': 9,
  'word-boundary-fuzzy': 8,
  contains: 7,
  subsequence: 6,
  description: 5,
  path: 4,
  url: 4,
};


export function normalizeRootSearchText(value: string): string {
  return String(value || '')
    .normalize('NFKD')
    .replace(COMBINING_MARK_REGEX, '')
    .toLowerCase()
    .replace(SEARCH_SEPARATOR_REGEX, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function compactRootSearchText(value: string): string {
  return normalizeRootSearchText(value).replace(SEARCH_SEPARATOR_REGEX, '').replace(/\s+/g, '');
}

export function tokenizeRootSearchQuery(value: string): string[] {
  const normalized = normalizeRootSearchText(value);
  return normalized ? normalized.split(/\s+/).filter(Boolean) : [];
}


function isSubsequenceMatch(needle: string, haystack: string): boolean {
  if (!needle) return true;
  if (!haystack) return false;
  let needleIndex = 0;
  for (let i = 0; i < haystack.length && needleIndex < needle.length; i += 1) {
    if (haystack[i] === needle[needleIndex]) needleIndex += 1;
  }
  return needleIndex === needle.length;
}

function hasBoundaryFuzzyMatch(term: string, value: string): boolean {
  if (!term || !value) return false;
  const normalized = normalizeRootSearchText(value);
  if (normalized.split(/\s+/).some((token) => token.startsWith(term))) return true;
  const compactTerm = compactRootSearchText(term);
  const boundaryChars = String(value || '').match(/[A-Z]?[a-z]+|[A-Z]+(?![a-z])|\d+/g) || [];
  const camelInitials = boundaryChars.map((part) => part[0]).join('');
  return Boolean(compactTerm.length >= 2 && compactRootSearchText(camelInitials).startsWith(compactTerm));
}

function scoreSingleField(term: string, fullQuery: string, field: RootSearchScoringField): RootSearchScoreResult {
  const raw = String(field.value || '');
  const normalized = normalizeRootSearchText(raw);
  if (!normalized) return { matched: false, matchKind: 'subsequence', matchScore: 0 };

  const normalizedTerm = normalizeRootSearchText(term);
  const compactField = compactRootSearchText(raw);
  const compactTerm = compactRootSearchText(term);
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const isSecondaryField = field.kind === 'description' || field.kind === 'path' || field.kind === 'url';
  const secondaryKind: MatchKind = field.kind === 'url' ? 'url' : field.kind === 'path' ? 'path' : 'description';
  const weight = field.weight ?? (field.kind === 'label' ? 1 : field.kind === 'alias' || field.kind === 'nickname' ? 1.04 : 0.72);

  let kind: MatchKind | null = null;
  let baseScore = 0;

  if (normalized === fullQuery || normalized === normalizedTerm) {
    kind = field.kind === 'alias' ? 'alias-exact' : field.kind === 'nickname' ? 'nickname-exact' : 'exact';
    baseScore = 1000;
  } else if (normalized.startsWith(normalizedTerm)) {
    kind = 'prefix';
    baseScore = 900;
  } else if (tokens.some((token) => token.startsWith(normalizedTerm))) {
    kind = 'token-prefix';
    baseScore = 780;
  } else if (compactTerm && compactField.startsWith(compactTerm)) {
    kind = 'compact-prefix';
    baseScore = 740;
  } else if (hasBoundaryFuzzyMatch(normalizedTerm, raw)) {
    kind = 'word-boundary-fuzzy';
    const compactness = Math.max(0, 1 - Math.max(0, compactField.length - compactTerm.length) / 24);
    baseScore = 620 + Math.round(compactness * 110);
  } else if (normalizedTerm.length >= 2 && normalized.includes(normalizedTerm)) {
    kind = 'contains';
    baseScore = 560;
  } else if (compactTerm.length >= 2 && isSubsequenceMatch(compactTerm, compactField)) {
    kind = 'subsequence';
    const density = compactTerm.length / Math.max(compactField.length, compactTerm.length);
    baseScore = 380 + Math.round(Math.min(140, density * 170));
  }

  if (!kind || baseScore <= 0) return { matched: false, matchKind: 'subsequence', matchScore: 0 };

  if (isSecondaryField && baseScore < 900) {
    kind = secondaryKind;
    baseScore = Math.min(500, Math.max(260, Math.round(baseScore * 0.72)));
  }

  const compactnessBoost = kind === 'exact' || kind === 'alias-exact' || kind === 'nickname-exact' || kind === 'prefix'
    ? Math.max(0, 36 - Math.max(0, compactField.length - compactTerm.length) * 2)
    : 0;
  const weightedScore = Math.round((baseScore + compactnessBoost) * weight);

  return { matched: true, matchKind: kind, matchScore: weightedScore };
}

export function scoreRootSearchFields(query: string, fields: RootSearchScoringField[]): RootSearchScoreResult {
  const fullQuery = normalizeRootSearchText(query);
  const queryTerms = tokenizeRootSearchQuery(query);
  if (!fullQuery || queryTerms.length === 0) {
    return { matched: false, matchKind: 'subsequence', matchScore: 0 };
  }

  let total = 0;
  let bestKind: MatchKind = 'subsequence';

  for (const term of queryTerms) {
    let bestForTerm: RootSearchScoreResult | null = null;
    for (const field of fields) {
      const scored = scoreSingleField(term, fullQuery, field);
      if (!scored.matched) continue;
      if (!bestForTerm || scored.matchScore > bestForTerm.matchScore) {
        bestForTerm = scored;
      }
    }
    if (!bestForTerm) {
      return { matched: false, matchKind: 'subsequence', matchScore: 0 };
    }
    total += bestForTerm.matchScore;
    if (MATCH_KIND_RANK[bestForTerm.matchKind] > MATCH_KIND_RANK[bestKind]) {
      bestKind = bestForTerm.matchKind;
    }
  }

  return {
    matched: true,
    matchKind: bestKind,
    matchScore: Math.round(total / queryTerms.length),
  };
}
