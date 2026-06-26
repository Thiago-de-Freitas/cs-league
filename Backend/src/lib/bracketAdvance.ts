import { Prisma } from '@prisma/client';
import { computeWalkoverWinners, getFeederPositions } from './bracket';
import { createPlayoffSlot, resolveBracketSlotWinner } from './playoffMatchFactory';

type Tx = Prisma.TransactionClient;

async function loadWalkoverWinners(
  tx: Tx,
  leagueId: string,
  bracketSize: number
): Promise<Map<number, string>> {
  const leagueTeams = await tx.leagueTeam.findMany({
    where: { leagueId, seed: { not: null } },
    select: { teamId: true, seed: true },
  });
  const seedToTeamId = new Map<number, string>();
  for (const lt of leagueTeams) {
    if (lt.seed != null) seedToTeamId.set(lt.seed, lt.teamId);
  }
  return computeWalkoverWinners(seedToTeamId, bracketSize);
}

/** Avança vencedores de uma rodada quando ambos os feeders estão definidos */
export async function advanceBracketFromRound(
  tx: Tx,
  leagueId: string,
  round: number,
  maxTeams: number,
  walkoverWinners: Map<number, string> = new Map()
): Promise<number> {
  const totalRounds = Math.log2(maxTeams);
  if (round >= totalRounds) return 0;

  const league = await tx.league.findUnique({
    where: { id: leagueId },
    select: { seriesFormat: true, mapPool: true, mapVetoEnabled: true },
  });
  if (!league) return 0;

  const persistedWalkovers = await loadWalkoverWinners(tx, leagueId, maxTeams);
  const mergedWalkovers = new Map<number, string>([...persistedWalkovers, ...walkoverWinners]);

  const nextRound = round + 1;
  const nextMatchCount = maxTeams / Math.pow(2, nextRound);
  let created = 0;

  for (let pos = 1; pos <= nextMatchCount; pos++) {
    const [feederA, feederB] = getFeederPositions(pos * 2);
    const w1 = await resolveBracketSlotWinner(tx, leagueId, round, feederA, mergedWalkovers.get(feederA) ?? null);
    const w2 = await resolveBracketSlotWinner(tx, leagueId, round, feederB, mergedWalkovers.get(feederB) ?? null);
    if (!w1 || !w2) continue;

    const existing = await tx.match.findFirst({
      where: { leagueId, round: nextRound, bracketPosition: pos, phase: 'PLAYOFF' },
      orderBy: { seriesGameNumber: 'asc' },
    });

    if (existing) {
      if (existing.seriesId) {
        await tx.match.deleteMany({ where: { seriesId: existing.seriesId } });
        await tx.matchSeries.delete({ where: { id: existing.seriesId } });
        await createPlayoffSlot(tx, league, {
          leagueId,
          team1Id: w1,
          team2Id: w2,
          round: nextRound,
          bracketPosition: pos,
          phase: 'PLAYOFF',
        });
      } else {
        await tx.match.update({
          where: { id: existing.id },
          data: { team1Id: w1, team2Id: w2, status: 'SCHEDULED', winnerId: null },
        });
      }
    } else {
      await createPlayoffSlot(tx, league, {
        leagueId,
        team1Id: w1,
        team2Id: w2,
        round: nextRound,
        bracketPosition: pos,
        phase: 'PLAYOFF',
      });
      created++;
    }
  }

  return created;
}
