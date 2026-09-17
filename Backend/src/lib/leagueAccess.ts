export type LeagueAccessRecord = {
  ownerId: string;
  registrationOpen: boolean;
  status: string;
};

export function checkLeagueAccess(params: {
  userId: string;
  role: string;
  league: LeagueAccessRecord | null;
  isTeamMember: boolean;
  isPlayerEntry: boolean;
}): { allowed: boolean; error?: string } {
  if (params.role === 'ADMIN') {
    return { allowed: true };
  }

  if (!params.league) {
    return { allowed: false, error: 'Liga não encontrada.' };
  }

  if (params.league.ownerId === params.userId) {
    return { allowed: true };
  }

  if (params.league.registrationOpen && params.league.status === 'UPCOMING') {
    return { allowed: true };
  }

  if (params.isTeamMember || params.isPlayerEntry) {
    return { allowed: true };
  }

  return { allowed: false, error: 'Sem permissão para acessar esta liga.' };
}
