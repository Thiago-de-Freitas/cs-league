import type { GameConfig } from './types';

const DEFAULT_MAP_POOL = ['summoners_rift'] as const;
const ALL_MAPS = [...DEFAULT_MAP_POOL] as const;

const MAP_LABELS: Record<string, string> = {
  summoners_rift: "Summoner's Rift",
};

export const LOL_CONFIG: GameConfig = {
  id: 'LOL',
  label: 'League of Legends',
  shortLabel: 'LoL',
  enabled: true,
  defaultTeamSize: 5,
  minPickupPlayersPerTeam: 5,
  maxPickupPlayersPerTeam: 5,
  seriesFormats: ['BO1', 'BO3', 'BO5'],
  allowedLeagueFormats: ['SINGLE_ELIMINATION', 'GROUP_STAGE'],
  scoringMode: 'GAMES_WON',
  statsIngestion: 'RIOT_API',
  supportsMapVeto: false,
  supportsDemoUpload: false,
  supportsOneVsOne: false,
  defaultMapPool: DEFAULT_MAP_POOL,
  allMaps: ALL_MAPS,
  mapLabels: MAP_LABELS,
  sides: [
    { id: 'ATTACK', label: 'Blue Side' },
    { id: 'DEFENDER', label: 'Red Side' },
  ],
  positions: [
    { id: 'TOP', label: 'Top' },
    { id: 'JUNGLE', label: 'Jungle' },
    { id: 'MID', label: 'Mid' },
    { id: 'ADC', label: 'ADC' },
    { id: 'SUPPORT', label: 'Support' },
  ],
  identityField: 'riotId',
  identityLabel: 'Riot ID',
  tagline: 'Competições de League of Legends',
};
