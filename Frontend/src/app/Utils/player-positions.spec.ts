import { getPlayerPositionLabel, normalizePlayerPositionForForm } from './player-positions';

describe('player-positions utils', () => {
  it('normalizePlayerPositionForForm converte lowercase da API para select', () => {
    expect(normalizePlayerPositionForForm('awp')).toBe('AWP');
    expect(normalizePlayerPositionForForm('AWP')).toBe('AWP');
    expect(normalizePlayerPositionForForm('')).toBe('');
    expect(normalizePlayerPositionForForm('invalid')).toBe('');
  });

  it('getPlayerPositionLabel aceita posição em lowercase', () => {
    expect(getPlayerPositionLabel('awp')).toBe('AWPer');
  });
});
