export interface User {
  id: string;
  email: string;
  displayName: string;
  steamId?: string | null;
  avatarUrl?: string | null;
  position?: string | null;
  role: 'USER' | 'ADMIN';
  isActive?: boolean;
  bannedUntil?: string | null;
  isBanned?: boolean;
  createdAt?: string;
}

export interface Player {
  id: string;
  name: string;
  IGN: string;
  role: string;
  memberTag?: string | null;
  position?: string | null;
  email?: string;
  steamId?: string | null;
  adr?: number | null;
  matches?: number;
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
  teamAdr?: number | null;
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
  format?: 'single_elimination' | 'group_stage' | 'one_vs_one' | string;
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
  mapPool?: string[];
  mapVetoEnabled?: boolean;
  seriesFormat?: 'bo1' | 'bo3' | string;
  pickupTeamCount?: number | null;
  pickupPlayersPerTeam?: number;
  pickupBalanceMode?: 'rating' | 'adr' | 'hs_percent' | 'position_mix' | string;
  pickupBalanceModes?: PickupBalanceMode[];
  pickupBalancedAt?: string | null;
}

export type PickupBalanceMode = 'rating' | 'adr' | 'hs_percent' | 'position_mix';

export interface PickupPlayer {
  id: string;
  userId: string;
  displayName: string;
  steamId: string | null;
  avatarUrl: string | null;
  position: string | null;
  positionLabel: string | null;
  teamId: string | null;
  adr: number | null;
  hsPercent: number | null;
  rating: number | null;
  matches: number;
}

export interface PickupSquad {
  id: string;
  name: string;
  tag: string;
  seed: number | null;
  players: PickupPlayer[];
  teamRating: number | null;
}

export interface PickupLeagueState {
  teamCount: number;
  playersPerTeam: number;
  balanceMode: PickupBalanceMode;
  balanceModes: PickupBalanceMode[];
  balancedAt: string | null;
  pool: PickupPlayer[];
  squads: PickupSquad[];
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
  mapLabel?: string | null;
  team1StartingSide?: string | null;
  team2StartingSide?: string | null;
  team1Rounds?: number | null;
  team2Rounds?: number | null;
  seriesId?: string | null;
  seriesGameNumber?: number | null;
  seriesStatus?: string | null;
  seriesWinnerId?: string | null;
  team1MapWins?: number | null;
  team2MapWins?: number | null;
  scheduledAt?: string | null;
  playedAt?: string | null;
  league?: {
    id: string;
    name: string;
    ownerId: string;
    maxTeams?: number | null;
    bracketSize?: number | null;
    seriesFormat?: string;
  };
  demos?: Demo[];
  aggregatedStats?: MatchPlayerStat[];
  hasGeneralDemo?: boolean;
  hasFileDemo?: boolean;
  manualDemoId?: string | null;
  roster?: {
    team1: MatchRosterPlayer[];
    team2: MatchRosterPlayer[];
  };
  permissions?: {
    canRegisterResult?: boolean;
    canEditManualStats?: boolean;
    captainTeamIds?: string[];
    canVeto?: boolean;
    canAdminReopenVeto?: boolean;
  };
  mapVetoEnabled?: boolean;
  mapVeto?: MapVetoState | null;
  lineup?: MatchLineupEntry[];
  images?: MatchImage[];
  highlights?: MatchHighlight[];
  series?: MatchSeriesInfo | null;
}

export interface SeriesVetoState {
  seriesId: string;
  format: string;
  mapPool: string[];
  bannedMaps: string[];
  pickedMaps: string[];
  assignedMaps: { game: number; map: string | null }[];
  firstActionTeamId: string;
  vetoTurnTeamId: string | null;
  vetoStatus: 'ban_phase' | 'pick_phase' | 'maps_assigned' | 'completed' | string;
  activeGameNumber: number;
  team1MapWins: number;
  team2MapWins: number;
  isStale: boolean;
  autoResolved?: boolean;
  vetoDeadlineAt?: string | null;
  deadlineExpired?: boolean;
  vetoReopenedByAdmin?: boolean;
}

export interface MatchSeriesInfo {
  series: SeriesVetoState;
  matches: { id: string; seriesGameNumber: number | null; map: string | null; status: string }[];
}

export interface MapVetoState {
  mapPool: string[];
  bannedMaps: string[];
  firstBanTeamId: string;
  vetoTurnTeamId: string | null;
  sidePickTeamId: string | null;
  status: 'ban_phase' | 'map_decided' | 'side_phase' | 'completed' | string;
  remainingMaps: string[];
  selectedMap: string | null;
  team1StartingSide: string | null;
  team2StartingSide: string | null;
  bansRequired: number;
  bansCompleted: number;
  isStale: boolean;
  autoResolved?: boolean;
  vetoDeadlineAt?: string | null;
  deadlineExpired?: boolean;
  vetoReopenedByAdmin?: boolean;
}

export interface MatchLineupEntry {
  teamId: string;
  userId: string;
  playerName: string;
  steamId?: string | null;
}

export interface MatchImage {
  id: string;
  matchId: string;
  imageUrl: string;
  caption?: string | null;
  createdAt?: string;
}

export interface MatchHighlight {
  id: string;
  matchId?: string;
  demoId?: string;
  round: number;
  tick?: number | null;
  clipStartTick?: number | null;
  clipEndTick?: number | null;
  clipRenderStatus?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'UNAVAILABLE' | string;
  clipVideoUrl?: string | null;
  clipRenderError?: string | null;
  steamId?: string | null;
  playerName: string;
  type: string;
  description: string;
  score: number;
  metadata?: Record<string, unknown> | null;
}

export type DemoHighlight = MatchHighlight;

export interface PersonalHighlightEntry extends DemoHighlight {
  demoFileName: string;
  demoCreatedAt?: string;
}

export interface PersonalHighlightsResponse {
  highlights: PersonalHighlightEntry[];
  total: number;
  videoExportAvailable: boolean;
}

export interface MatchRosterPlayer {
  userId: string;
  playerName: string;
  steamId?: string | null;
  teamId: string;
}

export interface ManualPlayerStatInput {
  userId?: string | null;
  steamId?: string | null;
  playerName: string;
  teamId: string;
  kills: number;
  deaths: number;
  assists: number;
  hsPercent: number;
  damage: number;
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
  uploadedById?: string;
  isPersonal?: boolean;
  isManual?: boolean;
  match?: Match | null;
  stats?: MatchPlayerStat[];
  highlights?: DemoHighlight[];
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
  teamId?: string | null;
  steamId?: string | null;
  playerName: string;
  kills: number;
  deaths: number;
  assists?: number;
  damage?: number;
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
  userId?: string | null;
  position?: string | null;
  positionLabel?: string | null;
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

export interface AdminUserEntry {
  id: string;
  email: string;
  displayName: string;
  steamId: string | null;
  avatarUrl: string | null;
  position: string | null;
  positionLabel: string | null;
  role: 'USER' | 'ADMIN' | string;
  isActive: boolean;
  bannedUntil: string | null;
  isBanned: boolean;
  createdAt: string;
  teamCount: number;
}

export interface AdminUsersPage {
  users: AdminUserEntry[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PublicUserTeam {
  id: string;
  name: string;
  tag: string | null;
  logoUrl: string | null;
  role: string;
}

export interface PublicUserProfile {
  id: string;
  displayName: string;
  email?: string;
  steamId: string | null;
  avatarUrl: string | null;
  position: string | null;
  positionLabel: string | null;
  role: string;
  createdAt: string;
  teamCount: number;
  teams: PublicUserTeam[];
  leagueStats: PlayerProfileStats | null;
  personalStats: PersonalStatsOverview | null;
  isSelf: boolean;
}

export interface AuditEvent {
  id: string;
  occurredAt: string;
  actorType: 'user' | 'system' | 'worker' | 'anonymous' | string;
  actorUserId?: string | null;
  actorLabel?: string | null;
  actorEmail?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  parentType?: string | null;
  parentId?: string | null;
  requestMethod?: string | null;
  requestPath?: string | null;
  correlationId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
  success: boolean;
  errorCode?: string | null;
}
