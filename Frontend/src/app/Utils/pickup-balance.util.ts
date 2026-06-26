export type PickupBalanceMode = 'rating' | 'adr' | 'hs_percent' | 'position_mix';

export const PICKUP_BALANCE_MODE_OPTIONS: { value: PickupBalanceMode; label: string }[] = [
  { value: 'rating', label: 'Rating geral' },
  { value: 'adr', label: 'ADR médio' },
  { value: 'hs_percent', label: '% de headshot' },
  { value: 'position_mix', label: 'Posições (AWP, lurker…)' },
];

export function normalizePickupBalanceMode(value: unknown): PickupBalanceMode {
  const raw = String(value ?? 'rating').toLowerCase();
  if (raw === 'adr' || raw === 'hs_percent' || raw === 'position_mix' || raw === 'rating') {
    return raw;
  }
  return 'rating';
}

export function normalizePickupBalanceModes(value: unknown): PickupBalanceMode[] {
  if (Array.isArray(value)) {
    const modes = value.map(normalizePickupBalanceMode).filter((mode, index, list) => list.indexOf(mode) === index);
    return modes.length > 0 ? modes : ['rating'];
  }
  if (typeof value === 'string' && value.includes(',')) {
    return normalizePickupBalanceModes(value.split(',').map((part) => part.trim()));
  }
  return [normalizePickupBalanceMode(value)];
}

export function formatPickupBalanceModesLabel(modes: PickupBalanceMode[]): string {
  const labels = new Map(PICKUP_BALANCE_MODE_OPTIONS.map((option) => [option.value, option.label]));
  return modes.map((mode) => labels.get(mode) ?? mode).join(', ');
}
