import { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

/** Marca a liga como COMPLETED quando todas as partidas relevantes estão finalizadas */
export async function tryCompleteLeague(tx: Tx, leagueId: string): Promise<void> {
  const league = await tx.league.findUnique({ where: { id: leagueId } });
  if (!league) return;

  const matches = await tx.match.findMany({ where: { leagueId } });
  if (matches.length === 0) return;

  if (league.format === 'GROUP_STAGE') {
    const groupMatches = matches.filter((m) => m.phase === 'GROUP');
    const playoffMatches = matches.filter((m) => m.phase === 'PLAYOFF');

    if (groupMatches.length === 0) return;

    if (!groupMatches.every((m) => m.status === 'COMPLETED')) return;

    // Fase de grupos concluída, mas playoffs ainda não gerados — liga continua em andamento
    if (playoffMatches.length === 0) {
      if (league.status === 'COMPLETED') {
        await tx.league.update({
          where: { id: leagueId },
          data: { status: 'ONGOING' },
        });
      }
      return;
    }

    if (!playoffMatches.every((m) => m.status === 'COMPLETED')) return;
  } else if (!matches.every((m) => m.status === 'COMPLETED')) {
    return;
  }

  await tx.league.update({
    where: { id: leagueId },
    data: { status: 'COMPLETED' },
  });
}
