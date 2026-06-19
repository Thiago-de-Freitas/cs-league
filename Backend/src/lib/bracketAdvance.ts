import { Prisma } from '@prisma/client';
import { getFeederPositions } from './bracket';

type Tx = Prisma.TransactionClient;

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

  const matches = await tx.match.findMany({
    where: { leagueId, round },
  });

  const winnerAt = (pos: number): string | null => {
    const m = matches.find((x) => x.bracketPosition === pos);
    if (m?.status === 'COMPLETED' && m.winnerId) return m.winnerId;
    return walkoverWinners.get(pos) ?? null;
  };

  const nextRound = round + 1;
  const nextMatchCount = maxTeams / Math.pow(2, nextRound);
  let created = 0;

  for (let pos = 1; pos <= nextMatchCount; pos++) {
    const [feederA, feederB] = getFeederPositions(pos * 2);
    const w1 = winnerAt(feederA);
    const w2 = winnerAt(feederB);
    if (!w1 || !w2) continue;

    const existing = await tx.match.findFirst({
      where: { leagueId, round: nextRound, bracketPosition: pos },
    });

    if (existing) {
      await tx.match.update({
        where: { id: existing.id },
        data: { team1Id: w1, team2Id: w2, status: 'SCHEDULED', winnerId: null },
      });
    } else {
      await tx.match.create({
        data: {
          leagueId,
          team1Id: w1,
          team2Id: w2,
          round: nextRound,
          bracketPosition: pos,
          status: 'SCHEDULED',
        },
      });
      created++;
    }
  }

  return created;
}
