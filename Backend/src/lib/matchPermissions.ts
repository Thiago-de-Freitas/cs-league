import { prisma } from './prisma';

type MatchTeams = {
  team1Id: string;
  team2Id: string;
  league: { ownerId: string; status: string };
};

export function checkMatchViewAccess(
  userId: string,
  role: string,
  match: MatchTeams,
  memberTeamIds: string[]
): boolean {
  if (role === 'ADMIN') return true;
  if (match.league.ownerId === userId) return true;
  return memberTeamIds.some((tid) => tid === match.team1Id || tid === match.team2Id);
}

export function checkMatchResultAccess(
  userId: string,
  role: string,
  match: MatchTeams,
  captainTeamIds: string[]
): boolean {
  if (role === 'ADMIN') return true;
  if (match.league.ownerId === userId) return true;
  return captainTeamIds.some((tid) => tid === match.team1Id || tid === match.team2Id);
}

export async function canUserAccessMatch(
  userId: string,
  role: string,
  matchId: string
): Promise<{ allowed: boolean; error?: string; match?: Awaited<ReturnType<typeof loadMatchForAccess>> }> {
  const match = await loadMatchForAccess(matchId);
  if (!match) {
    return { allowed: false, error: 'Partida não encontrada.' };
  }

  const memberTeamIds = await getMemberTeamIds(userId, match.team1Id, match.team2Id);
  const allowed = checkMatchViewAccess(userId, role, match, memberTeamIds);

  if (!allowed) {
    return { allowed: false, error: 'Sem permissão para visualizar esta partida.' };
  }

  return { allowed: true, match };
}

export async function canUserRegisterMatchResult(
  userId: string,
  role: string,
  matchId: string
): Promise<{ allowed: boolean; error?: string }> {
  const match = await loadMatchForAccess(matchId);
  if (!match) {
    return { allowed: false, error: 'Partida não encontrada.' };
  }

  if (match.league.status === 'ARCHIVED') {
    return { allowed: false, error: 'Liga arquivada. Não é possível registrar resultados.' };
  }

  const captainTeamIds = await getCaptainTeamIds(userId, match.team1Id, match.team2Id);
  const allowed = checkMatchResultAccess(userId, role, match, captainTeamIds);

  if (!allowed) {
    return { allowed: false, error: 'Sem permissão para registrar resultado desta partida.' };
  }

  return { allowed: true };
}

export async function canUserEditMatchStats(
  userId: string,
  role: string,
  matchId: string
): Promise<{ allowed: boolean; error?: string }> {
  const match = await loadMatchForAccess(matchId);
  if (!match) {
    return { allowed: false, error: 'Partida não encontrada.' };
  }

  if (match.league.status === 'ARCHIVED') {
    return { allowed: false, error: 'Liga arquivada. Não é possível editar estatísticas.' };
  }

  const captainTeamIds = await getCaptainTeamIds(userId, match.team1Id, match.team2Id);
  const allowed = checkMatchResultAccess(userId, role, match, captainTeamIds);

  if (!allowed) {
    return { allowed: false, error: 'Sem permissão para editar estatísticas desta partida.' };
  }

  return { allowed: true };
}

async function loadMatchForAccess(matchId: string) {
  return prisma.match.findUnique({
    where: { id: matchId },
    include: { league: { select: { ownerId: true, status: true } } },
  });
}

async function getMemberTeamIds(userId: string, team1Id: string, team2Id: string): Promise<string[]> {
  const memberships = await prisma.teamMember.findMany({
    where: { userId, teamId: { in: [team1Id, team2Id] } },
    select: { teamId: true },
  });
  return memberships.map((m) => m.teamId);
}

async function getCaptainTeamIds(userId: string, team1Id: string, team2Id: string): Promise<string[]> {
  const memberships = await prisma.teamMember.findMany({
    where: {
      userId,
      teamId: { in: [team1Id, team2Id] },
      role: 'CAPTAIN',
    },
    select: { teamId: true },
  });
  return memberships.map((m) => m.teamId);
}
