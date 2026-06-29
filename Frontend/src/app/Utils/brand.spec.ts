import { APP_NAME, APP_NAME_PARTS, APP_TAGLINE } from './brand';

describe('brand', () => {
  it('define o nome completo da plataforma', () => {
    expect(APP_NAME).toBe('Gamers League');
  });

  it('define as partes do logo', () => {
    expect(APP_NAME_PARTS.icon).toBe('GL');
    expect(APP_NAME_PARTS.primary).toBe('GAMERS');
    expect(APP_NAME_PARTS.secondary).toBe('LEAGUE');
  });

  it('define tagline genérica multi-jogo', () => {
    expect(APP_TAGLINE).toContain('ligas');
  });
});
