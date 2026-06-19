import { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

/** Marca a liga como COMPLETED quando todas as partidas estão finalizadas */
export async function tryCompleteLeague(tx: Tx, leagueId: string): Promise<void> {
  const matches = await tx.match.findMany({ where: { leagueId } });
  if (matches.length === 0) return;
  if (!matches.every((m) => m.status === 'COMPLETED')) return;

  await tx.league.update({
    where: { id: leagueId },
    data: { status: 'COMPLETED', endDate: new Date() },
  });
}
