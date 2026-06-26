export const CS2_MAPS = [
  { value: 'de_dust2', label: 'Dust II' },
  { value: 'de_mirage', label: 'Mirage' },
  { value: 'de_inferno', label: 'Inferno' },
  { value: 'de_nuke', label: 'Nuke' },
  { value: 'de_overpass', label: 'Overpass' },
  { value: 'de_vertigo', label: 'Vertigo' },
  { value: 'de_ancient', label: 'Ancient' },
  { value: 'de_anubis', label: 'Anubis' },
  { value: 'de_train', label: 'Train' },
] as const;

export const DEFAULT_MAP_POOL = [
  'de_ancient',
  'de_anubis',
  'de_dust2',
  'de_inferno',
  'de_mirage',
  'de_nuke',
  'de_vertigo',
] as const;

export function getMapLabel(mapId: string): string {
  const found = CS2_MAPS.find((m) => m.value === mapId);
  return found?.label ?? mapId;
}
