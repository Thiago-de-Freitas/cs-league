import type { PlayerPosition } from './playerPosition';
import { calcRating } from './rankings';

export type PickupBalanceMode = 'RATING' | 'ADR' | 'HS_PERCENT' | 'POSITION_MIX';

export type PickupBalanceModeApi = 'rating' | 'adr' | 'hs_percent' | 'position_mix';

export type PickupPlayerInput = {
  userId: string;
  position: PlayerPosition | null;
  adr: number;
  hsPercent: number;
  rating: number;
};

export type PickupAssignment = {
  userId: string;
  teamIndex: number;
};

const POSITION_PRIORITY: PlayerPosition[] = ['AWP', 'IGL', 'ENTRY', 'LURKER', 'RIFLER', 'SUPPORT', 'FLEX'];

const API_TO_INTERNAL: Record<PickupBalanceModeApi, PickupBalanceMode> = {
  rating: 'RATING',
  adr: 'ADR',
  hs_percent: 'HS_PERCENT',
  position_mix: 'POSITION_MIX',
};

const INTERNAL_TO_API: Record<PickupBalanceMode, PickupBalanceModeApi> = {
  RATING: 'rating',
  ADR: 'adr',
  HS_PERCENT: 'hs_percent',
  POSITION_MIX: 'position_mix',
};

function scorePlayer(player: PickupPlayerInput, mode: PickupBalanceMode): number {
  switch (mode) {
    case 'ADR':
      return player.adr;
    case 'HS_PERCENT':
      return player.hsPercent;
    case 'POSITION_MIX':
    case 'RATING':
    default:
      return player.rating;
  }
}

function compositeScore(player: PickupPlayerInput, modes: PickupBalanceMode[]): number {
  const numericModes = modes.filter((mode) => mode !== 'POSITION_MIX');
  if (numericModes.length === 0) return player.rating;
  const scores = numericModes.map((mode) => scorePlayer(player, mode));
  return scores.reduce((sum, value) => sum + value, 0) / scores.length;
}

function comparePlayers(a: PickupPlayerInput, b: PickupPlayerInput, modes: PickupBalanceMode[]): number {
  const scoreDiff = compositeScore(b, modes) - compositeScore(a, modes);
  if (scoreDiff !== 0) return scoreDiff;
  return b.rating - a.rating;
}

/** Snake draft; POSITION_MIX distribui posições antes de preencher por score composto. */
export function balancePlayersIntoTeams(
  players: PickupPlayerInput[],
  teamCount: number,
  playersPerTeam: number,
  modes: PickupBalanceMode | PickupBalanceMode[]
): PickupAssignment[] {
  if (teamCount < 1 || playersPerTeam < 1 || players.length === 0) return [];

  const resolvedModes = normalizePickupBalanceModesInternal(modes);
  const usePositionMix = resolvedModes.includes('POSITION_MIX');
  const buckets: PickupPlayerInput[][] = Array.from({ length: teamCount }, () => []);

  if (usePositionMix) {
    const byPosition = new Map<PlayerPosition | 'UNKNOWN', PickupPlayerInput[]>();
    for (const player of players) {
      const key = player.position ?? 'UNKNOWN';
      const list = byPosition.get(key) ?? [];
      list.push(player);
      byPosition.set(key, list);
    }

    for (const list of byPosition.values()) {
      list.sort((a, b) => comparePlayers(a, b, resolvedModes));
    }

    const positionOrder = [
      ...POSITION_PRIORITY.filter((p) => byPosition.has(p)),
      ...(byPosition.has('UNKNOWN') ? (['UNKNOWN'] as const) : []),
    ];

    for (const pos of positionOrder) {
      const pool = byPosition.get(pos as PlayerPosition | 'UNKNOWN') ?? [];
      let direction = 1;
      let index = 0;
      for (const player of pool) {
        buckets[index]!.push(player);
        if (index === teamCount - 1) direction = -1;
        else if (index === 0) direction = 1;
        index += direction;
      }
    }
  } else {
    const sorted = [...players].sort((a, b) => comparePlayers(a, b, resolvedModes));
    let direction = 1;
    let index = 0;
    for (const player of sorted) {
      buckets[index]!.push(player);
      if (index === teamCount - 1) direction = -1;
      else if (index === 0) direction = 1;
      index += direction;
    }
  }

  const assignments: PickupAssignment[] = [];
  for (let teamIndex = 0; teamIndex < buckets.length; teamIndex++) {
    const squad = buckets[teamIndex]!.slice(0, playersPerTeam);
    for (const player of squad) {
      assignments.push({ userId: player.userId, teamIndex });
    }
  }

  return assignments;
}

export function buildDefaultPlayerStats(
  userId: string,
  position: PlayerPosition | null,
  adr: number | null,
  hsPercent: number | null,
  rating: number | null
): PickupPlayerInput {
  const resolvedAdr = adr ?? 70;
  const resolvedHs = hsPercent ?? 35;
  const resolvedRating = rating ?? calcRating(1, resolvedAdr, 70, resolvedHs);
  return {
    userId,
    position,
    adr: resolvedAdr,
    hsPercent: resolvedHs,
    rating: resolvedRating,
  };
}

export function parsePickupBalanceMode(value: unknown): PickupBalanceMode {
  return normalizePickupBalanceModesInternal(value)[0] ?? 'RATING';
}

export function parsePickupBalanceModes(value: unknown): PickupBalanceMode[] {
  return normalizePickupBalanceModesInternal(value);
}

export function serializePickupBalanceModeForApi(mode: PickupBalanceMode): PickupBalanceModeApi {
  return INTERNAL_TO_API[mode];
}

export function serializePickupBalanceModesForApi(modes: PickupBalanceMode[]): PickupBalanceModeApi[] {
  return normalizePickupBalanceModesInternal(modes).map(serializePickupBalanceModeForApi);
}

function normalizePickupBalanceModesInternal(value: unknown): PickupBalanceMode[] {
  const rawList = Array.isArray(value)
    ? value
  : typeof value === 'string' && value.includes(',')
    ? value.split(',').map((part) => part.trim())
    : value == null
      ? []
      : [value];

  const modes = rawList
    .map((item) => {
      const raw = String(item ?? '').trim().toLowerCase();
      if (raw === 'adr') return 'ADR' as const;
      if (raw === 'hs_percent') return 'HS_PERCENT' as const;
      if (raw === 'position_mix') return 'POSITION_MIX' as const;
      if (raw === 'rating') return 'RATING' as const;
      const upper = String(item ?? '').trim().toUpperCase();
      if (upper === 'ADR' || upper === 'HS_PERCENT' || upper === 'POSITION_MIX' || upper === 'RATING') {
        return upper as PickupBalanceMode;
      }
      return null;
    })
    .filter((mode): mode is PickupBalanceMode => mode != null)
    .filter((mode, index, list) => list.indexOf(mode) === index);

  return modes.length > 0 ? modes : ['RATING'];
}

export function parsePickupBalanceModesFromApi(value: unknown): PickupBalanceMode[] {
  if (Array.isArray(value)) {
    return normalizePickupBalanceModesInternal(
      value.map((item) => API_TO_INTERNAL[String(item).toLowerCase() as PickupBalanceModeApi] ?? item)
    );
  }
  return normalizePickupBalanceModesInternal(value);
}

export function isValidPickupTeamCount(count: unknown): count is number {
  return Number.isInteger(count) && (count as number) >= 2 && (count as number) <= 16;
}

export function isValidPickupPlayersPerTeam(count: unknown): count is number {
  return Number.isInteger(count) && (count as number) >= 1 && (count as number) <= 5;
}
