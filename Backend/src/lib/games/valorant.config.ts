import type { GameConfig } from './types';

const DEFAULT_MAP_POOL = [
  'bind',
  'haven',
  'split',
  'ascent',
  'icebox',
  'breeze',
  'fracture',
] as const;

const ALL_MAPS = [...DEFAULT_MAP_POOL, 'pearl', 'lotus', 'sunset', 'abyss'] as const;

const MAP_LABELS: Record<string, string> = {
  bind: 'Bind',
  haven: 'Haven',
  split: 'Split',
  ascent: 'Ascent',
  icebox: 'Icebox',
  breeze: 'Breeze',
  fracture: 'Fracture',
  pearl: 'Pearl',
  lotus: 'Lotus',
  sunset: 'Sunset',
  abyss: 'Abyss',
};

export const VALORANT_CONFIG: GameConfig = {
  id: 'VALORANT',
  label: 'Valorant',
  shortLabel: 'Valorant',
  enabled: true,
  defaultTeamSize: 5,
  minPickupPlayersPerTeam: 5,
  maxPickupPlayersPerTeam: 5,
  seriesFormats: ['BO1', 'BO3', 'BO5'],
  allowedLeagueFormats: ['SINGLE_ELIMINATION', 'GROUP_STAGE', 'ONE_VS_ONE'],
  scoringMode: 'ROUNDS',
  statsIngestion: 'RIOT_API',
  supportsMapVeto: true,
  supportsDemoUpload: false,
  supportsOneVsOne: true,
  defaultMapPool: DEFAULT_MAP_POOL,
  allMaps: ALL_MAPS,
  mapLabels: MAP_LABELS,
  sides: [
    { id: 'ATTACK', label: 'Ataque' },
    { id: 'DEFENDER', label: 'Defesa' },
  ],
  positions: [
    { id: 'DUELIST', label: 'Duelist' },
    { id: 'INITIATOR', label: 'Initiator' },
    { id: 'CONTROLLER', label: 'Controller' },
    { id: 'SENTINEL', label: 'Sentinel' },
    { id: 'FLEX', label: 'Flex' },
  ],
  identityField: 'riotId',
  identityLabel: 'Riot ID',
  tagline: 'Competições de Valorant',
};
