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

export function getPlayerPositionLabel(position: PlayerPosition | string | null | undefined): string {
  if (!position) return '';
  const normalized = position.toString().trim().toUpperCase();
  return PLAYER_POSITION_LABELS[normalized as PlayerPosition] ?? position;
}

export function normalizePlayerPositionForForm(
  position: PlayerPosition | string | null | undefined
): PlayerPosition | '' {
  if (!position?.toString().trim()) return '';
  const normalized = position.toString().trim().toUpperCase();
  return (PLAYER_POSITIONS as readonly string[]).includes(normalized)
    ? (normalized as PlayerPosition)
    : '';
}
