import { GameTitle } from '@prisma/client';
import {
  getGameConfig,
  getMapLabelForGame,
  isValidMapIdForGame,
  parseMapPoolForGame,
  validateMapPoolForSeriesFormat as validateMapPoolForSeriesFormatGame,
} from './games';

/** @deprecated Use getGameConfig('CS2') — mantido para compatibilidade */
export const DEFAULT_CS2_MAP_POOL = getGameConfig('CS2').defaultMapPool;

/** @deprecated Use getGameConfig('CS2') — mantido para compatibilidade */
export const ALL_CS2_MAPS = getGameConfig('CS2').allMaps;

export function parseMapPool(input: unknown, game: GameTitle | string = 'CS2'): string[] {
  return parseMapPoolForGame(input, game);
}

export function isValidMapId(mapId: string, game: GameTitle | string = 'CS2'): boolean {
  return isValidMapIdForGame(mapId, game);
}

export function getMapLabel(mapId: string, game: GameTitle | string = 'CS2'): string {
  return getMapLabelForGame(mapId, game);
}

export function validateMapPoolForSeriesFormat(
  mapPool: string[],
  format: 'BO1' | 'BO3' | 'BO5',
  game: GameTitle | string = 'CS2'
): string | null {
  return validateMapPoolForSeriesFormatGame(mapPool, format, game);
}
