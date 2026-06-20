export interface User {
  id: string;
  email: string;
  displayName: string;
  steamId?: string | null;
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
  points: number;
  seed?: number;
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
  maxTeams?: number;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  teams: Team[];
  matches?: Match[];
  status: 'upcoming' | 'ongoing' | 'completed' | 'archived' | string;
  ownerId?: string;
  owner?: { id: string; displayName: string };
  teamCount?: number;
  matchCount?: number;
}

export interface Match {
  id: string;
  leagueId: string;
  team1: { id: string; name: string; tag: string };
  team2: { id: string; name: string; tag: string };
  winner?: { id: string; name: string; tag: string } | null;
  winnerId?: string | null;
  status: string;
  round?: number;
  bracketPosition?: number | null;
  map?: string | null;
  playedAt?: string | null;
  league?: { id: string; name: string; ownerId: string; maxTeams?: number };
  demos?: Demo[];
  aggregatedStats?: MatchPlayerStat[];
  hasGeneralDemo?: boolean;
  permissions?: {
    canRegisterResult?: boolean;
  };
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
  demos: number;
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
