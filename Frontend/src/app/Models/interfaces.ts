export interface User {
  id: string;
  email: string;
  displayName: string;
  steamId?: string | null;
  avatarUrl?: string | null;
  role: 'USER' | 'ADMIN';
  createdAt?: string;
}

export interface Player {
  id: string;
  name: string;
  IGN: string;
  role: string;
  email?: string;
  steamId?: string | null;
}

export interface Team {
  id: string;
  name: string;
  tag?: string;
  logoUrl?: string;
  ownerId?: string;
  players: Player[];
  wins: number;
  losses: number;
  draws: number;
  points: number;
  roundsWon: number;
  roundsLost: number;
  roundDifference?: number;
  seed?: number;
  groupId?: string | null;
  invites?: TeamInvite[];
}

export interface TeamInvite {
  id: string;
  invitedUser: { id: string; displayName: string; email: string };
  status: string;
  team?: { id: string; name: string; tag: string };
}

export interface League {
  id: string;
  name: string;
  description: string;
  format?: 'single_elimination' | 'group_stage' | string;
  maxTeams?: number | null;
  bracketSize?: number | null;
  effectiveBracketSize?: number;
  groupCount?: number;
  advancePerGroup?: number;
  homeAndAway?: boolean;
  matchesPerMatchDay?: number;
  groupPhaseGenerated?: boolean;
  groupPhaseComplete?: boolean;
  playoffGenerated?: boolean;
  groups?: LeagueGroup[];
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  defaultMatchDays?: number[];
  defaultMatchTime?: string;
  scheduleTimezone?: string;
  scheduleConfigured?: boolean;
  scheduleWeekOverrides?: { weekStart: string; daysOfWeek: number[] }[];
  teams: Team[];
  matches?: Match[];
  status: 'upcoming' | 'ongoing' | 'completed' | 'archived' | string;
  registrationOpen?: boolean;
  ownerId?: string;
  owner?: { id: string; displayName: string };
  teamCount?: number;
  matchCount?: number;
  remainingSlots?: number;
  userHasTeamInLeague?: boolean;
}

export interface LeagueGroup {
  id: string;
  name: string;
  order: number;
  teams: Team[];
  standings: GroupStanding[];
  matches: Match[];
  expectedMatches?: number;
  matchesComplete?: boolean;
}

export interface GroupStanding {
  teamId: string;
  team: { id: string; name: string; tag: string };
  wins: number;
  losses: number;
  draws: number;
  points: number;
  roundsWon: number;
  roundsLost: number;
  roundDifference: number;
  played: number;
  rank: number;
}

export interface Match {
  id: string;
  leagueId: string;
  team1: { id: string; name: string; tag: string };
  team2: { id: string; name: string; tag: string };
  winner?: { id: string; name: string; tag: string } | null;
  winnerId?: string | null;
  status: string;
  phase?: 'group' | 'playoff' | string;
  groupId?: string | null;
  groupRound?: number | null;
  round?: number;
  bracketPosition?: number | null;
  map?: string | null;
  team1Rounds?: number | null;
  team2Rounds?: number | null;
  scheduledAt?: string | null;
  playedAt?: string | null;
  league?: { id: string; name: string; ownerId: string; maxTeams?: number | null; bracketSize?: number | null };
  demos?: Demo[];
  aggregatedStats?: MatchPlayerStat[];
  hasGeneralDemo?: boolean;
  permissions?: {
    canRegisterResult?: boolean;
  };
}

export interface LeagueScheduleConfig {
  startDate?: string | null;
  endDate?: string | null;
  defaultMatchDays: number[];
  defaultMatchTime: string;
  scheduleTimezone: string;
  scheduleConfigured?: boolean;
  weekOverrides: LeagueScheduleWeekOverride[];
}

export interface LeagueScheduleWeekOverride {
  weekStart: string;
  daysOfWeek: number[];
}

export interface Demo {
  id: string;
  fileName: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | string;
  errorMessage?: string | null;
  matchId?: string | null;
  isPersonal?: boolean;
  match?: Match | null;
  stats?: MatchPlayerStat[];
  createdAt?: string;
  updatedAt?: string;
  playerCount?: number;
}

export interface PersonalStatsSummary {
  demosTotal: number;
  demosCompleted: number;
  kills: number;
  deaths: number;
  kd: number;
  adr: number;
  hsPercent: number;
  kast: number;
  rating: number;
}

export interface PersonalDemoStat {
  demoId: string;
  fileName: string;
  status: string;
  createdAt: string;
  kills: number;
  deaths: number;
  kd: number;
  adr: number;
  hsPercent: number;
  kast: number;
}

export interface PersonalStatsOverview {
  summary: PersonalStatsSummary;
  demos: PersonalDemoStat[];
}

export interface PersonalDemoValidation {
  valid: boolean;
  error?: string;
  code?: string;
}

export interface MatchPlayerStat {
  id: string;
  demoId: string;
  steamId?: string | null;
  playerName: string;
  kills: number;
  deaths: number;
  adr: number;
  hsPercent: number;
  kast: number;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface PlayerRankingEntry {
  rank: number;
  playerName: string;
  displayName?: string | null;
  steamId?: string | null;
  /** Quantidade de jogos de liga (demos oficiais de partida). */
  demos: number;
  matches?: number;
  kills: number;
  deaths: number;
  kd: number;
  adr: number;
  hsPercent: number;
  kast: number;
  rating: number;
}

export interface PlayerProfileStats {
  steamId: string;
  playerName: string;
  displayName?: string | null;
  demos: number;
  matches?: number;
  kills: number;
  deaths: number;
  kd: number;
  adr: number;
  hsPercent: number;
  kast: number;
  rating: number;
}

export interface TeamRankingEntry {
  rank: number;
  teamId: string;
  name: string;
  tag: string;
  logoUrl?: string | null;
  wins: number;
  losses: number;
  leagues: number;
}
