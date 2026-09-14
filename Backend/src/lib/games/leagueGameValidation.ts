import type { GameTitle, LeagueFormat, SeriesFormat } from '@prisma/client';
import {
  getGameConfig,
  normalizeSeriesFormat,
  parseGameTitle,
  parseMapPoolForGame,
  validateMapPoolForSeriesFormat,
} from './index';

export interface ResolvedLeagueGameSettings {
  game: GameTitle;
  leagueFormat: LeagueFormat;
  mapPool: string[];
  seriesFormat: SeriesFormat;
  mapVetoEnabled: boolean;
  pickupPlayersPerTeam: number;
}

export function resolveLeagueFormatInput(format: unknown): LeagueFormat {
  const raw = String(format ?? '').toUpperCase();
  if (raw === 'ONE_VS_ONE') return 'ONE_VS_ONE';
  if (raw === 'GROUP_STAGE') return 'GROUP_STAGE';
  if (raw === 'POINTS_RACE') return 'POINTS_RACE';
  return 'SINGLE_ELIMINATION';
}

export function validateLeagueGameSettings(body: {
  game?: unknown;
  format?: unknown;
  mapPool?: unknown;
  seriesFormat?: unknown;
  mapVetoEnabled?: unknown;
  pickupPlayersPerTeam?: unknown;
}): ResolvedLeagueGameSettings | { error: string } {
  const game = parseGameTitle(body.game) ?? 'CS2';
  const config = getGameConfig(game);
  const leagueFormat = resolveLeagueFormatInput(body.format);

  if (!config.allowedLeagueFormats.includes(leagueFormat)) {
    return {
      error: `${config.label} não suporta o formato ${leagueFormat.toLowerCase().replace(/_/g, ' ')}.`,
    };
  }

  if (leagueFormat === 'ONE_VS_ONE' && !config.supportsOneVsOne) {
    return { error: `${config.label} não suporta ligas pickup 1v1.` };
  }

  const mapPool = parseMapPoolForGame(body.mapPool, game);
  const seriesFormat = normalizeSeriesFormat(body.seriesFormat, game) as SeriesFormat;
  const poolError = validateMapPoolForSeriesFormat(mapPool, seriesFormat, game);
  if (poolError && config.supportsMapVeto) {
    return { error: poolError };
  }

  const mapVetoEnabled = config.supportsMapVeto
    ? seriesFormat === 'BO3' || seriesFormat === 'BO5'
      ? true
      : body.mapVetoEnabled !== false
    : false;

  let pickupPlayersPerTeam = config.defaultTeamSize;
  if (leagueFormat === 'ONE_VS_ONE') {
    const raw = Number(body.pickupPlayersPerTeam);
    if (
      Number.isInteger(raw) &&
      raw >= config.minPickupPlayersPerTeam &&
      raw <= config.maxPickupPlayersPerTeam
    ) {
      pickupPlayersPerTeam = raw;
    }
  }

  return {
    game,
    leagueFormat,
    mapPool,
    seriesFormat,
    mapVetoEnabled,
    pickupPlayersPerTeam,
  };
}
