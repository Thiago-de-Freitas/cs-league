import { remainingMaps, getOtherTeamId, pickRandomFrom } from './mapVeto';

export const BO3_BANS_REQUIRED = 2;
export const BO3_PICKS_REQUIRED = 2;

export function getBo3ActionTeam(
  firstActionTeamId: string,
  otherTeamId: string,
  stepIndex: number
): string {
  return stepIndex % 2 === 0 ? firstActionTeamId : otherTeamId;
}

export function bo3BansCompleted(bannedCount: number): boolean {
  return bannedCount >= BO3_BANS_REQUIRED;
}

export function bo3PicksCompleted(pickedCount: number): boolean {
  return pickedCount >= BO3_PICKS_REQUIRED;
}

export function resolveBo3MapAssignment(
  mapPool: string[],
  bannedMaps: string[],
  pickedMaps: string[]
): { map1: string; map2: string; map3: string } | null {
  if (pickedMaps.length < BO3_PICKS_REQUIRED) return null;
  const remaining = remainingMaps(mapPool, bannedMaps);
  const decider = remaining.find((m) => !pickedMaps.includes(m));
  if (!decider || remaining.length < 1) return null;
  return {
    map1: pickedMaps[0],
    map2: pickedMaps[1],
    map3: decider,
  };
}

export function randomBo3Ban(pool: string[], banned: string[], picked: string[]): string {
  const remaining = remainingMaps(pool, banned).filter((m) => !picked.includes(m));
  return pickRandomFrom(remaining);
}

export function randomBo3Pick(pool: string[], banned: string[], picked: string[]): string {
  const remaining = remainingMaps(pool, banned).filter((m) => !picked.includes(m));
  return pickRandomFrom(remaining);
}

export function getBo3SidePickTeam(
  firstActionTeamId: string,
  team1Id: string,
  team2Id: string,
  gameNumber: number
): string {
  const otherTeamId = getOtherTeamId(team1Id, team2Id, firstActionTeamId);
  return gameNumber % 2 === 1 ? otherTeamId : firstActionTeamId;
}
