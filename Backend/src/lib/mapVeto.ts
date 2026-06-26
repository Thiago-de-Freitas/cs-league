import type { GameSide, MapVetoStatus } from '@prisma/client';
import { DEFAULT_CS2_MAP_POOL } from './cs2Maps';

export const VETO_ACTION_TIMEOUT_MS = 15 * 60 * 1000;

export type MapVetoState = {
  mapPool: string[];
  bannedMaps: string[];
  firstBanTeamId: string;
  vetoTurnTeamId: string | null;
  sidePickTeamId: string | null;
  status: MapVetoStatus;
  remainingMaps: string[];
  selectedMap: string | null;
  team1StartingSide: GameSide | null;
  team2StartingSide: GameSide | null;
  bansRequired: number;
  bansCompleted: number;
  isStale: boolean;
};

export function getOtherTeamId(team1Id: string, team2Id: string, teamId: string): string {
  return teamId === team1Id ? team2Id : team1Id;
}

export function getBanTeamForStep(firstBanTeamId: string, otherTeamId: string, banIndex: number): string {
  return banIndex % 2 === 0 ? firstBanTeamId : otherTeamId;
}

export function remainingMaps(pool: string[], banned: string[]): string[] {
  const bannedSet = new Set(banned);
  return pool.filter((m) => !bannedSet.has(m));
}

export function bansRequiredForPool(poolSize: number): number {
  return Math.max(0, poolSize - 1);
}

export function getSidePickTeamId(firstBanTeamId: string, otherTeamId: string, banCount: number): string {
  if (banCount <= 0) return firstBanTeamId;
  const lastBanTeam = getBanTeamForStep(firstBanTeamId, otherTeamId, banCount - 1);
  return lastBanTeam === firstBanTeamId ? otherTeamId : firstBanTeamId;
}

export function pickRandomFrom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export function applyStartingSides(
  pickingTeamId: string,
  team1Id: string,
  team2Id: string,
  side: GameSide
): { team1StartingSide: GameSide; team2StartingSide: GameSide } {
  const other: GameSide = side === 'CT' ? 'T' : 'CT';
  if (pickingTeamId === team1Id) {
    return { team1StartingSide: side, team2StartingSide: other };
  }
  return { team1StartingSide: other, team2StartingSide: side };
}

export function buildMapVetoView(input: {
  mapPool: string[];
  bannedMaps: string[];
  firstBanTeamId: string;
  team1Id: string;
  team2Id: string;
  vetoTurnTeamId: string | null;
  sidePickTeamId: string | null;
  status: MapVetoStatus;
  selectedMap: string | null;
  team1StartingSide: GameSide | null;
  team2StartingSide: GameSide | null;
  lastActionAt: Date;
  now?: Date;
}): MapVetoState {
  const now = input.now ?? new Date();
  const otherTeamId = getOtherTeamId(input.team1Id, input.team2Id, input.firstBanTeamId);
  const rem = remainingMaps(input.mapPool, input.bannedMaps);
  const bansRequired = bansRequiredForPool(input.mapPool.length);

  return {
    mapPool: input.mapPool,
    bannedMaps: input.bannedMaps,
    firstBanTeamId: input.firstBanTeamId,
    vetoTurnTeamId: input.vetoTurnTeamId,
    sidePickTeamId: input.sidePickTeamId,
    status: input.status,
    remainingMaps: rem,
    selectedMap: input.selectedMap,
    team1StartingSide: input.team1StartingSide,
    team2StartingSide: input.team2StartingSide,
    bansRequired,
    bansCompleted: input.bannedMaps.length,
    isStale: now.getTime() - input.lastActionAt.getTime() > VETO_ACTION_TIMEOUT_MS,
  };
}

export function coinFlipFirstBanTeam(team1Id: string, team2Id: string): string {
  return Math.random() < 0.5 ? team1Id : team2Id;
}

export function defaultMapPool(): string[] {
  return [...DEFAULT_CS2_MAP_POOL];
}
