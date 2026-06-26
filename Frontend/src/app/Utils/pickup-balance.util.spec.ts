import {
  formatPickupBalanceModesLabel,
  normalizePickupBalanceMode,
  normalizePickupBalanceModes,
} from './pickup-balance.util';

describe('pickup-balance.util', () => {
  it('normaliza modo único em lowercase', () => {
    expect(normalizePickupBalanceMode('RATING')).toBe('rating');
    expect(normalizePickupBalanceMode('ADR')).toBe('adr');
  });

  it('normaliza lista de modos e remove duplicados', () => {
    expect(normalizePickupBalanceModes(['RATING', 'adr', 'rating'])).toEqual(['rating', 'adr']);
    expect(normalizePickupBalanceModes('rating')).toEqual(['rating']);
  });

  it('usa rating como fallback', () => {
    expect(normalizePickupBalanceModes([])).toEqual(['rating']);
    expect(normalizePickupBalanceModes('invalid')).toEqual(['rating']);
  });

  it('normaliza string separada por vírgula', () => {
    expect(normalizePickupBalanceModes('rating, adr, hs_percent')).toEqual(['rating', 'adr', 'hs_percent']);
  });

  it('formata rótulos dos critérios', () => {
    expect(formatPickupBalanceModesLabel(['rating', 'adr'])).toBe('Rating geral, ADR médio');
  });
});
