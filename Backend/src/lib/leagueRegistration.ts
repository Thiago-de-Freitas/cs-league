export type LeagueForRegistration = {
  registrationOpen: boolean;
  status: string;
  maxTeams: number | null;
  teamCount: number;
  matchCount: number;
};

export type TeamForRegistration = {
  ownerId: string;
};

import { hasRegistrationSlots } from './bracket';

export function isLeagueAcceptingRegistration(league: LeagueForRegistration): boolean {
  return (
    league.registrationOpen &&
    league.status === 'UPCOMING' &&
    league.matchCount === 0 &&
    hasRegistrationSlots(league.teamCount, league.maxTeams)
  );
}

export function canUserRegisterTeam(
  userId: string,
  role: string,
  league: LeagueForRegistration,
  team: TeamForRegistration,
  teamAlreadyInLeague: boolean
): { allowed: boolean; error?: string } {
  if (!isLeagueAcceptingRegistration(league)) {
    return { allowed: false, error: 'Inscrições fechadas para esta liga.' };
  }
  if (teamAlreadyInLeague) {
    return { allowed: false, error: 'Este time já está inscrito nesta liga.' };
  }
  if (role !== 'ADMIN' && team.ownerId !== userId) {
    return { allowed: false, error: 'Apenas o dono do time pode inscrevê-lo.' };
  }
  return { allowed: true };
}
