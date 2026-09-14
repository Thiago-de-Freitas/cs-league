import { CS2_MAPS, DEFAULT_MAP_POOL } from './maps';

export type GameId = 'cs2' | 'valorant' | 'lol' | 'pubg';

export interface GameMapOption {
  value: string;
  label: string;
}

const VALORANT_MAPS: GameMapOption[] = [
  { value: 'bind', label: 'Bind' },
  { value: 'haven', label: 'Haven' },
  { value: 'split', label: 'Split' },
  { value: 'ascent', label: 'Ascent' },
  { value: 'icebox', label: 'Icebox' },
  { value: 'breeze', label: 'Breeze' },
  { value: 'fracture', label: 'Fracture' },
  { value: 'pearl', label: 'Pearl' },
  { value: 'lotus', label: 'Lotus' },
  { value: 'sunset', label: 'Sunset' },
  { value: 'abyss', label: 'Abyss' },
];

const LOL_MAPS: GameMapOption[] = [
  { value: 'summoners_rift', label: "Summoner's Rift" },
];

const PUBG_MAPS: GameMapOption[] = [
  { value: 'erangel', label: 'Erangel' },
  { value: 'miramar', label: 'Miramar' },
  { value: 'taego', label: 'Taego' },
  { value: 'deston', label: 'Deston' },
  { value: 'vikendi', label: 'Vikendi' },
  { value: 'rondo', label: 'Rondo' },
];

const DEFAULT_POOLS: Record<GameId, readonly string[]> = {
  cs2: DEFAULT_MAP_POOL,
  valorant: ['bind', 'haven', 'split', 'ascent', 'icebox', 'breeze', 'fracture'],
  lol: ['summoners_rift'],
  pubg: ['erangel', 'miramar', 'taego', 'deston'],
};

export function getMapsForGame(game: GameId | string): GameMapOption[] {
  const id = String(game).toLowerCase() as GameId;
  if (id === 'valorant') return VALORANT_MAPS;
  if (id === 'lol') return LOL_MAPS;
  if (id === 'pubg') return PUBG_MAPS;
  return CS2_MAPS.map((m) => ({ value: m.value, label: m.label }));
}

export function getDefaultMapPoolForGame(game: GameId | string): string[] {
  const id = String(game).toLowerCase() as GameId;
  return [...(DEFAULT_POOLS[id] ?? DEFAULT_POOLS.cs2)];
}

export function getMapLabelForGame(mapId: string, game: GameId | string = 'cs2'): string {
  const found = getMapsForGame(game).find((m) => m.value === mapId);
  return found?.label ?? mapId;
}
