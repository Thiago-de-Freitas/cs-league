import type { GameConfig } from './types';

const DEFAULT_MAP_POOL = [
  'de_ancient',
  'de_anubis',
  'de_dust2',
  'de_inferno',
  'de_mirage',
  'de_nuke',
  'de_vertigo',
] as const;

const ALL_MAPS = [...DEFAULT_MAP_POOL, 'de_overpass', 'de_train'] as const;

const MAP_LABELS: Record<string, string> = {
  de_dust2: 'Dust II',
  de_mirage: 'Mirage',
  de_inferno: 'Inferno',
  de_nuke: 'Nuke',
  de_overpass: 'Overpass',
  de_vertigo: 'Vertigo',
  de_ancient: 'Ancient',
  de_anubis: 'Anubis',
  de_train: 'Train',
};

export const CS2_CONFIG: GameConfig = {
  id: 'CS2',
  label: 'Counter-Strike 2',
  shortLabel: 'CS2',
  enabled: true,
  defaultTeamSize: 5,
  minPickupPlayersPerTeam: 1,
  maxPickupPlayersPerTeam: 5,
  seriesFormats: ['BO1', 'BO3'],
  allowedLeagueFormats: ['SINGLE_ELIMINATION', 'GROUP_STAGE', 'ONE_VS_ONE'],
  scoringMode: 'ROUNDS',
  statsIngestion: 'DEMO_UPLOAD',
  supportsMapVeto: true,
  supportsDemoUpload: true,
  supportsOneVsOne: true,
  defaultMapPool: DEFAULT_MAP_POOL,
  allMaps: ALL_MAPS,
  mapLabels: MAP_LABELS,
  sides: [
    { id: 'CT', label: 'CT' },
    { id: 'T', label: 'T' },
  ],
  positions: [
    { id: 'AWP', label: 'AWPer' },
    { id: 'RIFLER', label: 'Rifler' },
    { id: 'ENTRY', label: 'Entry' },
    { id: 'LURKER', label: 'Lurker' },
    { id: 'IGL', label: 'IGL' },
    { id: 'SUPPORT', label: 'Suporte' },
    { id: 'FLEX', label: 'Flex' },
  ],
  identityField: 'steamId',
  identityLabel: 'Steam ID',
  tagline: 'Competições de Counter-Strike 2',
};
