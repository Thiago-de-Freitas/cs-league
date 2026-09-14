import type { GameSide, GameTitle, LeagueFormat, SeriesFormat } from '@prisma/client';

export type ScoringMode = 'ROUNDS' | 'GAMES_WON' | 'PLACEMENT_POINTS';
export type StatsIngestion = 'DEMO_UPLOAD' | 'RIOT_API' | 'PUBG_API' | 'MANUAL_ONLY';

export interface GameSideConfig {
  id: GameSide;
  label: string;
}

export interface GamePositionConfig {
  id: string;
  label: string;
}

export interface GameMapConfig {
  id: string;
  label: string;
}

export interface GameConfig {
  id: GameTitle;
  label: string;
  shortLabel: string;
  enabled: boolean;
  defaultTeamSize: number;
  minPickupPlayersPerTeam: number;
  maxPickupPlayersPerTeam: number;
  seriesFormats: SeriesFormat[];
  allowedLeagueFormats: LeagueFormat[];
  scoringMode: ScoringMode;
  statsIngestion: StatsIngestion;
  supportsMapVeto: boolean;
  supportsDemoUpload: boolean;
  supportsOneVsOne: boolean;
  defaultMapPool: readonly string[];
  allMaps: readonly string[];
  mapLabels: Record<string, string>;
  sides: GameSideConfig[];
  positions: GamePositionConfig[];
  identityField: 'steamId' | 'riotId' | 'pubgAccountId';
  identityLabel: string;
  tagline: string;
}

export type SeriesFormatInput = SeriesFormat | 'BO1' | 'BO3' | 'BO5';
