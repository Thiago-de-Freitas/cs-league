import type { PlayerPosition } from './playerPosition';
import { calcRating } from './rankings';

export type PickupBalanceMode = 'RATING' | 'ADR' | 'HS_PERCENT' | 'POSITION_MIX';

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

/** Snake draft por score; POSITION_MIX distribui posições antes de preencher por rating. */
export function balancePlayersIntoTeams(
  players: PickupPlayerInput[],
  teamCount: number,
  playersPerTeam: number,
  mode: PickupBalanceMode
): PickupAssignment[] {
  if (teamCount < 1 || playersPerTeam < 1 || players.length === 0) return [];

  const buckets: PickupPlayerInput[][] = Array.from({ length: teamCount }, () => []);

  if (mode === 'POSITION_MIX') {
    const byPosition = new Map<PlayerPosition | 'UNKNOWN', PickupPlayerInput[]>();
    for (const player of players) {
      const key = player.position ?? 'UNKNOWN';
      const list = byPosition.get(key) ?? [];
      list.push(player);
      byPosition.set(key, list);
    }

    for (const list of byPosition.values()) {
      list.sort((a, b) => b.rating - a.rating);
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
    const sorted = [...players].sort((a, b) => scorePlayer(b, mode) - scorePlayer(a, mode));
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
  const raw = String(value ?? 'RATING').toUpperCase();
  if (raw === 'ADR' || raw === 'HS_PERCENT' || raw === 'POSITION_MIX' || raw === 'RATING') {
    return raw;
  }
  return 'RATING';
}

export function isValidPickupTeamCount(count: unknown): count is number {
  return Number.isInteger(count) && (count as number) >= 2 && (count as number) <= 16;
}

export function isValidPickupPlayersPerTeam(count: unknown): count is number {
  return Number.isInteger(count) && (count as number) >= 1 && (count as number) <= 5;
}
