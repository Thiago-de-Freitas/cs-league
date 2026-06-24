export const PLAYER_POSITIONS = [
  'AWP',
  'RIFLER',
  'ENTRY',
  'LURKER',
  'IGL',
  'SUPPORT',
  'FLEX',
] as const;

export type PlayerPosition = (typeof PLAYER_POSITIONS)[number];

export const CAPTAIN_RANKING_FILTER = 'CAPTAIN' as const;

export type RankingPositionFilter = PlayerPosition | typeof CAPTAIN_RANKING_FILTER;

export const PLAYER_POSITION_LABELS: Record<PlayerPosition, string> = {
  AWP: 'AWPer',
  RIFLER: 'Rifler',
  ENTRY: 'Entry',
  LURKER: 'Lurker',
  IGL: 'IGL',
  SUPPORT: 'Suporte',
  FLEX: 'Flex',
};

export const RANKING_POSITION_OPTIONS: { id: RankingPositionFilter; label: string }[] = [
  ...PLAYER_POSITIONS.map((id) => ({ id, label: PLAYER_POSITION_LABELS[id] })),
  { id: CAPTAIN_RANKING_FILTER, label: 'Capitão' },
];

export function parsePlayerPosition(value: unknown): PlayerPosition | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return (PLAYER_POSITIONS as readonly string[]).includes(normalized)
    ? (normalized as PlayerPosition)
    : null;
}

export function parseRankingPositionFilter(value: unknown): RankingPositionFilter | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const normalized = value.trim().toUpperCase();
  if (normalized === CAPTAIN_RANKING_FILTER) return CAPTAIN_RANKING_FILTER;
  return parsePlayerPosition(normalized);
}

export function parsePlayerPositionOptional(value: unknown): PlayerPosition | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const parsed = parsePlayerPosition(String(value));
  return parsed ?? undefined;
}

export function getPlayerPositionLabel(position: PlayerPosition | string | null | undefined): string {
  if (!position) return '';
  return PLAYER_POSITION_LABELS[position as PlayerPosition] ?? position;
}
