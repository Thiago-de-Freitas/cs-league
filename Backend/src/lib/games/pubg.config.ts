import type { GameConfig } from './types';

const DEFAULT_MAP_POOL = [
  'erangel',
  'miramar',
  'taego',
  'deston',
] as const;

const ALL_MAPS = [...DEFAULT_MAP_POOL, 'vikendi', 'rondo'] as const;

const MAP_LABELS: Record<string, string> = {
  erangel: 'Erangel',
  miramar: 'Miramar',
  taego: 'Taego',
  deston: 'Deston',
  vikendi: 'Vikendi',
  rondo: 'Rondo',
};

export const PUBG_CONFIG: GameConfig = {
  id: 'PUBG',
  label: 'PUBG',
  shortLabel: 'PUBG',
  enabled: true,
  defaultTeamSize: 4,
  minPickupPlayersPerTeam: 4,
  maxPickupPlayersPerTeam: 4,
  seriesFormats: ['BO1'],
  allowedLeagueFormats: ['POINTS_RACE'],
  scoringMode: 'PLACEMENT_POINTS',
  statsIngestion: 'PUBG_API',
  supportsMapVeto: false,
  supportsDemoUpload: false,
  supportsOneVsOne: false,
  defaultMapPool: DEFAULT_MAP_POOL,
  allMaps: ALL_MAPS,
  mapLabels: MAP_LABELS,
  sides: [],
  positions: [
    { id: 'IGL', label: 'IGL' },
    { id: 'FRAGGER', label: 'Fragger' },
    { id: 'SUPPORT', label: 'Suporte' },
    { id: 'FLEX', label: 'Flex' },
  ],
  identityField: 'pubgAccountId',
  identityLabel: 'Conta PUBG',
  tagline: 'Competições de PUBG',
};
