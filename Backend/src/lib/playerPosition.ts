import { GameTitle } from '@prisma/client';
import { getGameConfig } from './games';

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

export function getPositionsForGame(game: GameTitle | string = 'CS2') {
  return getGameConfig(game).positions;
}

export function getRankingPositionOptionsForGame(game: GameTitle | string = 'CS2') {
  const positions = getPositionsForGame(game);
  return [
    ...positions.map((p) => ({ id: p.id as RankingPositionFilter, label: p.label })),
    { id: CAPTAIN_RANKING_FILTER, label: 'Capitão' },
  ];
}

export function parsePlayerPosition(value: unknown, game: GameTitle | string = 'CS2'): PlayerPosition | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  const valid = getPositionsForGame(game).map((p) => p.id);
  return valid.includes(normalized) ? (normalized as PlayerPosition) : null;
}

export function parseRankingPositionFilter(value: unknown, game: GameTitle | string = 'CS2'): RankingPositionFilter | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const normalized = value.trim().toUpperCase();
  if (normalized === CAPTAIN_RANKING_FILTER) return CAPTAIN_RANKING_FILTER;
  return parsePlayerPosition(normalized, game);
}

export function parsePlayerPositionOptional(
  value: unknown,
  game: GameTitle | string = 'CS2'
): PlayerPosition | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const parsed = parsePlayerPosition(String(value), game);
  return parsed ?? undefined;
}

export function getPlayerPositionLabel(
  position: PlayerPosition | string | null | undefined,
  game: GameTitle | string = 'CS2'
): string {
  if (!position) return '';
  const fromGame = getPositionsForGame(game).find((p) => p.id === position)?.label;
  if (fromGame) return fromGame;
  return PLAYER_POSITION_LABELS[position as PlayerPosition] ?? position;
}
