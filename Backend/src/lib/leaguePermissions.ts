import { prisma } from './prisma';
import { checkLeagueAccess } from './leagueAccess';

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

  const [membership, playerEntry] = league
    ? await Promise.all([
        prisma.leagueTeam.findFirst({
          where: {
            leagueId,
            team: { members: { some: { userId } } },
          },
          select: { id: true },
        }),
        prisma.leaguePlayerEntry.findFirst({
          where: { leagueId, userId },
          select: { id: true },
        }),
      ])
    : [null, null];

  return checkLeagueAccess({
    userId,
    role,
    league,
    isTeamMember: !!membership,
    isPlayerEntry: !!playerEntry,
  });
}
