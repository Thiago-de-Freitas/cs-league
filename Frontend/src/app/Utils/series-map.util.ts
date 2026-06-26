export type LeagueSeriesFormat = 'bo1' | 'bo3';

export type LeagueUiFormat =
  | 'one_vs_one'
  | 'single_elimination'
  | 'single_group'
  | 'multi_group'
  | string;

export function showMapSeriesOptions(format: LeagueUiFormat): boolean {
  return (
    format === 'one_vs_one'
    || format === 'single_elimination'
    || format === 'single_group'
    || format === 'multi_group'
  );
}

export function validateLeagueMapSettings(
  mapPool: string[],
  seriesFormat: LeagueSeriesFormat
): string | null {
  if (mapPool.length < 2) {
    return 'Selecione pelo menos 2 mapas no pool.';
  }
  if (seriesFormat === 'bo3' && mapPool.length < 5) {
    return 'BO3 exige pelo menos 5 mapas no pool.';
  }
  return null;
}

export function buildMapSettingsPayload(
  seriesFormat: LeagueSeriesFormat,
  mapVetoEnabled: boolean,
  mapPool: string[]
): { mapPool: string[]; seriesFormat: LeagueSeriesFormat; mapVetoEnabled: boolean } {
  return {
    mapPool,
    seriesFormat,
    mapVetoEnabled: seriesFormat === 'bo3' ? true : mapVetoEnabled,
  };
}

export function getMapSeriesScopeHint(input: {
  isOneVsOne: boolean;
  isGroupStage: boolean;
}): string {
  if (input.isOneVsOne) {
    return 'Define como o vencedor é decidido na partida desta liga.';
  }
  if (input.isGroupStage) {
    return 'Aplica-se ao mata-mata. Na fase de grupos, cada jogo continua sendo 1 mapa por partida.';
  }
  return 'Aplica-se a cada confronto do mata-mata desta liga.';
}

export function getSeriesFormatLabel(seriesFormat: LeagueSeriesFormat | string | null | undefined): string {
  return seriesFormat === 'bo3' ? 'Melhor de 3 mapas' : '1 mapa (vitória única)';
}

export function shouldShowMapPool(seriesFormat: LeagueSeriesFormat, mapVetoEnabled: boolean): boolean {
  return seriesFormat === 'bo3' || mapVetoEnabled;
}

export function getMapPoolHint(seriesFormat: LeagueSeriesFormat): string {
  if (seriesFormat === 'bo3') {
    return 'BO3 exige pelo menos 5 mapas (2 bans, 2 picks e mapa decider).';
  }
  return 'BO1 com veto: capitães banem até restar um mapa. Mínimo 2 mapas.';
}

export function getVetoFlowDescription(
  seriesFormat: LeagueSeriesFormat,
  mapVetoEnabled: boolean
): string {
  if (seriesFormat === 'bo3') {
    return 'No BO3, capitães definem os 3 mapas da série antes dos jogos. Cada mapa vencido conta para o placar da série (ex.: 2–0 ou 2–1).';
  }
  if (mapVetoEnabled) {
    return 'No BO1 com veto, capitães alternam bans até sobrar um único mapa. O vencedor desse mapa vence o confronto.';
  }
  return 'No BO1 sem veto, não há escolha automática de mapas. Informe o mapa ao registrar o resultado.';
}

export function getVetoSteps(seriesFormat: LeagueSeriesFormat, mapVetoEnabled: boolean): string[] {
  if (seriesFormat === 'bo3') {
    return [
      '2 bans alternados (removem mapas do pool)',
      '2 picks alternados (cada time escolhe um mapa)',
      'O mapa restante é o decider (3º jogo)',
      'Antes de cada mapa, capitães escolhem o lado CT/T',
    ];
  }
  if (mapVetoEnabled) {
    return [
      'Capitães alternam bans até restar 1 mapa',
      'O time que não fez o último ban escolhe CT ou T',
      'Vitória no mapa = vitória no confronto',
    ];
  }
  return [];
}
