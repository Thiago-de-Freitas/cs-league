/** Map pool padrão estilo Valve (7 mapas — veto BO1 com 6 bans alternados). */
export const DEFAULT_CS2_MAP_POOL = [
  'de_ancient',
  'de_anubis',
  'de_dust2',
  'de_inferno',
  'de_mirage',
  'de_nuke',
  'de_vertigo',
] as const;

export const ALL_CS2_MAPS = [
  ...DEFAULT_CS2_MAP_POOL,
  'de_overpass',
  'de_train',
] as const;

const MAP_SET = new Set<string>(ALL_CS2_MAPS);

export function parseMapPool(input: unknown): string[] {
  if (!Array.isArray(input) || input.length < 2) {
    return [...DEFAULT_CS2_MAP_POOL];
  }
  const maps = input
    .map((m) => String(m).trim().toLowerCase())
    .filter((m) => MAP_SET.has(m));
  const unique = [...new Set(maps)];
  return unique.length >= 2 ? unique : [...DEFAULT_CS2_MAP_POOL];
}

export function isValidMapId(mapId: string): boolean {
  return MAP_SET.has(mapId.trim().toLowerCase());
}

export function getMapLabel(mapId: string): string {
  const labels: Record<string, string> = {
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
  return labels[mapId] ?? mapId;
}

export function validateMapPoolForSeriesFormat(
  mapPool: string[],
  format: 'BO1' | 'BO3'
): string | null {
  if (mapPool.length < 2) {
    return 'O map pool deve ter pelo menos 2 mapas.';
  }
  if (format === 'BO3' && mapPool.length < 5) {
    return 'BO3 exige pelo menos 5 mapas no pool (2 bans, 2 picks e mapa decider).';
  }
  return null;
}
