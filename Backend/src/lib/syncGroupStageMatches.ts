import type { Prisma } from '@prisma/client';
import { applyGroupMatchSchedule } from './applyLeagueSchedule';
import { generateRoundRobinPairings, type RoundRobinMatch } from './groupStage';

type Tx = Prisma.TransactionClient;

export interface GroupMatchPair {
  team1Id: string;
  team2Id: string;
  groupRound?: number | null;
}

export interface SyncGroupStageResult {
  createdMatches: number;
  assignedTeams: number;
  createdMatchRecords: { id: string; team1Id: string; team2Id: string }[];
}

export function buildGroupMatchSignature(
  team1Id: string,
  team2Id: string,
  groupRound: number | null | undefined,
  homeAndAway: boolean
): string {
  if (homeAndAway) {
    return `${team1Id}\t${team2Id}\t${groupRound ?? 0}`;
  }
  const [a, b] = [team1Id, team2Id].sort();
  return `${a}\t${b}`;
}

/** Retorna confrontos round-robin que ainda não existem na liga. */
export function findMissingRoundRobinMatches(
  teamIds: string[],
  existing: GroupMatchPair[],
  homeAndAway: boolean
): RoundRobinMatch[] {
  const expected = generateRoundRobinPairings(teamIds, homeAndAway);
  const existingKeys = new Set(
    existing.map((m) => buildGroupMatchSignature(m.team1Id, m.team2Id, m.groupRound, homeAndAway))
  );
  return expected.filter(
    (pairing) =>
      !existingKeys.has(
        buildGroupMatchSignature(pairing.team1Id, pairing.team2Id, pairing.groupRound, homeAndAway)
      )
  );
}

export async function syncGroupStageMatches(tx: Tx, leagueId: string): Promise<SyncGroupStageResult> {
  const league = await tx.league.findUnique({ where: { id: leagueId } });
  if (!league || league.format !== 'GROUP_STAGE') {
    throw new Error('NOT_GROUP_STAGE');
  }

  const groups = await tx.leagueGroup.findMany({
    where: { leagueId },
    orderBy: { order: 'asc' },
  });
  if (groups.length === 0) {
    throw new Error('GROUP_PHASE_NOT_GENERATED');
  }

  let assignedTeams = 0;
  const unassigned = await tx.leagueTeam.findMany({
    where: { leagueId, groupId: null },
  });

  if (unassigned.length > 0) {
    if (league.groupCount === 1) {
      await tx.leagueTeam.updateMany({
        where: { leagueId, groupId: null },
        data: { groupId: groups[0].id },
      });
      assignedTeams += unassigned.length;
    } else {
      for (const lt of unassigned) {
        const counts = await Promise.all(
          groups.map(async (group) => ({
            group,
            count: await tx.leagueTeam.count({ where: { leagueId, groupId: group.id } }),
          }))
        );
        counts.sort((a, b) => a.count - b.count);
        await tx.leagueTeam.update({
          where: { id: lt.id },
          data: { groupId: counts[0].group.id },
        });
        assignedTeams++;
      }
    }
  }

  const leagueTeams = await tx.leagueTeam.findMany({ where: { leagueId } });
  const existingMatches = await tx.match.findMany({
    where: { leagueId, phase: 'GROUP' },
    select: { id: true, team1Id: true, team2Id: true, groupRound: true, groupId: true },
  });

  let createdMatches = 0;
  const createdMatchRecords: { id: string; team1Id: string; team2Id: string }[] = [];

  for (const group of groups) {
    const teamIds = leagueTeams.filter((lt) => lt.groupId === group.id).map((lt) => lt.teamId);
    if (teamIds.length < 2) continue;

    const groupExisting = existingMatches.filter((m) => m.groupId === group.id);
    const missing = findMissingRoundRobinMatches(teamIds, groupExisting, league.homeAndAway);

    for (const pairing of missing) {
      const created = await tx.match.create({
        data: {
          leagueId,
          groupId: group.id,
          team1Id: pairing.team1Id,
          team2Id: pairing.team2Id,
          phase: 'GROUP',
          groupRound: pairing.groupRound,
          round: 0,
          status: 'SCHEDULED',
        },
        select: { id: true, team1Id: true, team2Id: true },
      });
      createdMatches++;
      createdMatchRecords.push(created);
    }
  }

  if (createdMatches > 0 && league.groupCount === 1) {
    await applyGroupMatchSchedule(tx, leagueId);
  }

  return { createdMatches, assignedTeams, createdMatchRecords };
}
