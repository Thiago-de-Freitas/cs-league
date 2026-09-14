import { GameTitle } from '@prisma/client';
import { CS2_CONFIG } from './cs2.config';
import { VALORANT_CONFIG } from './valorant.config';
import { LOL_CONFIG } from './lol.config';
import { PUBG_CONFIG } from './pubg.config';
import type { GameConfig, SeriesFormatInput } from './types';

const GAME_CONFIGS: Record<GameTitle, GameConfig> = {
  CS2: CS2_CONFIG,
  VALORANT: VALORANT_CONFIG,
  LOL: LOL_CONFIG,
  PUBG: PUBG_CONFIG,
};

export type { GameConfig, ScoringMode, StatsIngestion, SeriesFormatInput } from './types';
export { CS2_CONFIG, VALORANT_CONFIG, LOL_CONFIG, PUBG_CONFIG };

export function getGameConfig(game: GameTitle | string | null | undefined): GameConfig {
  const normalized = String(game ?? 'CS2').toUpperCase() as GameTitle;
  return GAME_CONFIGS[normalized] ?? CS2_CONFIG;
}

export function listEnabledGames(): GameConfig[] {
  return Object.values(GAME_CONFIGS).filter((g) => g.enabled);
}

export function parseGameTitle(value: unknown): GameTitle | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const normalized = value.trim().toUpperCase() as GameTitle;
  return normalized in GAME_CONFIGS ? normalized : null;
}

export function parseMapPoolForGame(input: unknown, game: GameTitle | string): string[] {
  const config = getGameConfig(game);
  const mapSet = new Set<string>(config.allMaps);
  if (!Array.isArray(input) || input.length < 2) {
    return [...config.defaultMapPool];
  }
  const maps = input
    .map((m) => String(m).trim().toLowerCase())
    .filter((m) => mapSet.has(m));
  const unique = [...new Set(maps)];
  return unique.length >= 2 ? unique : [...config.defaultMapPool];
}

export function isValidMapIdForGame(mapId: string, game: GameTitle | string): boolean {
  const config = getGameConfig(game);
  return new Set<string>(config.allMaps).has(mapId.trim().toLowerCase());
}

export function getMapLabelForGame(mapId: string, game: GameTitle | string): string {
  const config = getGameConfig(game);
  const normalized = mapId.trim().toLowerCase();
  return config.mapLabels[normalized] ?? mapId;
}

export function validateMapPoolForSeriesFormat(
  mapPool: string[],
  format: SeriesFormatInput,
  game: GameTitle | string = 'CS2'
): string | null {
  const config = getGameConfig(game);
  if (!config.supportsMapVeto) {
    return mapPool.length >= 1 ? null : 'O map pool deve ter pelo menos 1 mapa.';
  }
  if (mapPool.length < 2) {
    return 'O map pool deve ter pelo menos 2 mapas.';
  }
  const fmt = String(format).toUpperCase();
  if (fmt === 'BO3' && mapPool.length < 5) {
    return 'BO3 exige pelo menos 5 mapas no pool (2 bans, 2 picks e mapa decider).';
  }
  if (fmt === 'BO5' && mapPool.length < 7) {
    return 'BO5 exige pelo menos 7 mapas no pool.';
  }
  return null;
}

export function normalizeSeriesFormat(
  value: unknown,
  game: GameTitle | string = 'CS2'
): SeriesFormatInput {
  const config = getGameConfig(game);
  const raw = String(value ?? 'BO1').toUpperCase();
  if (raw === 'BO5' && config.seriesFormats.includes('BO5')) return 'BO5';
  if (raw === 'BO3' && config.seriesFormats.includes('BO3')) return 'BO3';
  return 'BO1';
}

export function isValidGameSideForGame(side: string, game: GameTitle | string): boolean {
  const config = getGameConfig(game);
  return config.sides.some((s) => s.id === side);
}

export function getGameSideLabel(side: string, game: GameTitle | string): string {
  const config = getGameConfig(game);
  return config.sides.find((s) => s.id === side)?.label ?? side;
}

export function getPositionLabelForGame(position: string, game: GameTitle | string): string {
  const config = getGameConfig(game);
  return config.positions.find((p) => p.id === position)?.label ?? position;
}

export function isValidPositionForGame(position: string, game: GameTitle | string): boolean {
  const config = getGameConfig(game);
  return config.positions.some((p) => p.id === position);
}

export function serializeGameForApi(config: GameConfig) {
  return {
    id: config.id,
    label: config.label,
    shortLabel: config.shortLabel,
    tagline: config.tagline,
    defaultTeamSize: config.defaultTeamSize,
    minPickupPlayersPerTeam: config.minPickupPlayersPerTeam,
    maxPickupPlayersPerTeam: config.maxPickupPlayersPerTeam,
    seriesFormats: config.seriesFormats.map((f) => f.toLowerCase()),
    allowedLeagueFormats: config.allowedLeagueFormats.map((f) => f.toLowerCase()),
    scoringMode: config.scoringMode,
    statsIngestion: config.statsIngestion,
    supportsMapVeto: config.supportsMapVeto,
    supportsDemoUpload: config.supportsDemoUpload,
    supportsOneVsOne: config.supportsOneVsOne,
    defaultMapPool: [...config.defaultMapPool],
    maps: config.allMaps.map((id) => ({ id, label: config.mapLabels[id] ?? id })),
    sides: config.sides,
    positions: config.positions,
    identityField: config.identityField,
    identityLabel: config.identityLabel,
  };
}
