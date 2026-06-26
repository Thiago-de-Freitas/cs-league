import { Prisma } from '@prisma/client';
import { getFairBracketSize, getFirstRoundPairings, rankTeamsForSeeding } from './bracket';
import { advanceBracketFromRound } from './bracketAdvance';
import { createPlayoffSlot } from './playoffMatchFactory';
import {
  areAllGroupMatchesComplete,
  computeGroupStandings,
  getQualifiersFromGroups,
} from './groupStage';

type Tx = Prisma.TransactionClient;

export interface GenerateGroupStagePlayoffsResult {
  generated: boolean;
  bracketSize?: number;
  qualifiers?: number;
  round1Matches?: number;
  walkovers?: number;
  advancedMatches?: number;
  reason?: string;
}

/** Gera o mata-mata com os classificados quando a fase de grupos termina */
export async function tryGenerateGroupStagePlayoffs(
  tx: Tx,
  leagueId: string
): Promise<GenerateGroupStagePlayoffsResult> {
  const league = await tx.league.findUnique({ where: { id: leagueId } });
  if (!league || league.format !== 'GROUP_STAGE') {
    return { generated: false, reason: 'not_group_stage' };
  }

  const groupMatches = await tx.match.findMany({
    where: { leagueId, phase: 'GROUP' },
  });
  if (groupMatches.length === 0) {
    return { generated: false, reason: 'no_group_matches' };
  }
  if (!areAllGroupMatchesComplete(groupMatches)) {
    return { generated: false, reason: 'group_incomplete' };
  }

  const existingPlayoffs = await tx.match.count({
    where: { leagueId, phase: 'PLAYOFF', round: { gt: 0 } },
  });
  if (existingPlayoffs > 0) {
    return { generated: false, reason: 'playoffs_already_generated' };
  }

  const groups = await tx.leagueGroup.findMany({
    where: { leagueId },
    orderBy: { order: 'asc' },
    include: {
      teams: true,
      matches: { where: { phase: 'GROUP' } },
    },
  });

  const distributions = groups.map((g) => ({
    name: g.name,
    order: g.order,
    teamIds: g.teams.map((t) => t.teamId),
  }));

  const standingsByGroup = new Map(
    groups.map((g) => [
      g.name,
      computeGroupStandings(
        g.teams.map((t) => t.teamId),
        g.matches.map((m) => ({
          team1Id: m.team1Id,
          team2Id: m.team2Id,
          winnerId: m.winnerId,
          status: m.status,
          team1Rounds: m.team1Rounds,
          team2Rounds: m.team2Rounds,
        }))
      ),
    ])
  );

  const qualifierIds = getQualifiersFromGroups(
    distributions,
    standingsByGroup,
    league.advancePerGroup
  );

  if (qualifierIds.length < 2) {
    return { generated: false, reason: 'too_few_qualifiers' };
  }

  const qualifierTeams = await tx.leagueTeam.findMany({
    where: { leagueId, teamId: { in: qualifierIds } },
  });

  const ranked = rankTeamsForSeeding(
    qualifierTeams.map((lt) => {
      const groupStanding = [...standingsByGroup.values()]
        .flat()
        .find((s) => s.teamId === lt.teamId);
      return {
        ...lt,
        points: groupStanding?.points ?? 0,
        wins: groupStanding?.wins ?? 0,
        losses: groupStanding?.losses ?? 0,
        draws: groupStanding?.draws ?? 0,
        roundsWon: groupStanding?.roundsWon ?? 0,
        roundsLost: groupStanding?.roundsLost ?? 0,
      };
    })
  );

  await tx.match.deleteMany({
    where: { leagueId, phase: 'PLAYOFF' },
  });

  for (const [index, lt] of ranked.entries()) {
    await tx.leagueTeam.update({
      where: { id: lt.id },
      data: { seed: index + 1, wins: 0, losses: 0, draws: 0, points: 0, roundsWon: 0, roundsLost: 0 },
    });
  }

  await tx.leagueTeam.updateMany({
    where: {
      leagueId,
      teamId: { notIn: qualifierIds },
    },
    data: { seed: null },
  });

  const bracketSize = getFairBracketSize(ranked.length);
  const pairings = getFirstRoundPairings(bracketSize);
  const seedToTeam = new Map<number, (typeof ranked)[0]>();
  ranked.forEach((lt, i) => seedToTeam.set(i + 1, lt));

  const walkoverWinners = new Map<number, string>();
  let walkovers = 0;
  let round1Matches = 0;

  for (let position = 0; position < pairings.length; position++) {
    const [seedA, seedB] = pairings[position];
    const pos = position + 1;
    const teamA = seedToTeam.get(seedA);
    const teamB = seedToTeam.get(seedB);

    if (!teamA && !teamB) continue;

    if (teamA && !teamB) {
      walkoverWinners.set(pos, teamA.teamId);
      walkovers++;
      continue;
    }
    if (!teamA && teamB) {
      walkoverWinners.set(pos, teamB.teamId);
      walkovers++;
      continue;
    }

    if (teamA && teamB) {
      await createPlayoffSlot(tx, league, {
        leagueId,
        team1Id: teamA.teamId,
        team2Id: teamB.teamId,
        round: 1,
        bracketPosition: pos,
        phase: 'PLAYOFF',
      });
      round1Matches++;
    }
  }

  const advancedMatches = await advanceBracketFromRound(
    tx,
    leagueId,
    1,
    bracketSize,
    walkoverWinners
  );

  await tx.league.update({
    where: { id: leagueId },
    data: { bracketSize, status: 'ONGOING' },
  });

  return {
    generated: true,
    bracketSize,
    qualifiers: qualifierIds.length,
    round1Matches,
    walkovers,
    advancedMatches,
  };
}
