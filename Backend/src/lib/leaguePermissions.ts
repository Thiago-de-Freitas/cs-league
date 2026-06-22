import { prisma } from './prisma';

export async function canUserAccessLeague(
  userId: string,
  role: string,
  leagueId: string
): Promise<{ allowed: boolean; error?: string }> {
  if (role === 'ADMIN') {
    return { allowed: true };
  }

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { ownerId: true, registrationOpen: true, status: true },
  });

  if (!league) {
    return { allowed: false, error: 'Liga não encontrada.' };
  }

  if (league.ownerId === userId) {
    return { allowed: true };
  }

  if (league.registrationOpen && league.status === 'UPCOMING') {
    return { allowed: true };
  }

  const membership = await prisma.leagueTeam.findFirst({
    where: {
      leagueId,
      team: { members: { some: { userId } } },
    },
    select: { id: true },
  });

  if (membership) {
    return { allowed: true };
  }

  return { allowed: false, error: 'Sem permissão para acessar esta liga.' };
}
