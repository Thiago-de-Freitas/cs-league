import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildMapSettingsPayload,
  getMapPoolHint,
  getMapSeriesScopeHint,
  getSeriesFormatLabel,
  getVetoFlowDescription,
  getVetoSteps,
  shouldShowMapPool,
  showMapSeriesOptions,
  validateLeagueMapSettings,
} from './series-map.util';

const FIVE_MAPS = ['de_ancient', 'de_anubis', 'de_dust2', 'de_inferno', 'de_mirage'];
const TWO_MAPS = ['de_dust2', 'de_mirage'];

describe('series-map.util', () => {
  it('showMapSeriesOptions por formato de liga', () => {
    assert.equal(showMapSeriesOptions('one_vs_one'), true);
    assert.equal(showMapSeriesOptions('single_elimination'), true);
    assert.equal(showMapSeriesOptions('single_group'), true);
    assert.equal(showMapSeriesOptions('multi_group'), true);
    assert.equal(showMapSeriesOptions('swiss'), false);
  });

  it('validateLeagueMapSettings — BO1 e BO3', () => {
    assert.equal(validateLeagueMapSettings(TWO_MAPS, 'bo1'), null);
    assert.equal(validateLeagueMapSettings(FIVE_MAPS, 'bo3'), null);
    assert.match(validateLeagueMapSettings(['de_dust2'], 'bo1')!, /2 mapas/);
    assert.match(validateLeagueMapSettings(TWO_MAPS, 'bo3')!, /5 mapas/);
  });

  it('buildMapSettingsPayload — BO3 força veto', () => {
    assert.deepEqual(buildMapSettingsPayload('bo3', false, FIVE_MAPS), {
      mapPool: FIVE_MAPS,
      seriesFormat: 'bo3',
      mapVetoEnabled: true,
    });
    assert.deepEqual(buildMapSettingsPayload('bo1', true, TWO_MAPS), {
      mapPool: TWO_MAPS,
      seriesFormat: 'bo1',
      mapVetoEnabled: true,
    });
  });

  it('getMapSeriesScopeHint por contexto', () => {
    assert.match(getMapSeriesScopeHint({ isOneVsOne: true, isGroupStage: false }), /partida desta liga/);
    assert.match(getMapSeriesScopeHint({ isOneVsOne: false, isGroupStage: true }), /fase de grupos/);
    assert.match(getMapSeriesScopeHint({ isOneVsOne: false, isGroupStage: false }), /mata-mata/);
  });

  it('rótulos e hints de veto', () => {
    assert.equal(getSeriesFormatLabel('bo3'), 'Melhor de 3 mapas');
    assert.equal(getSeriesFormatLabel('bo1'), '1 mapa (vitória única)');
    assert.equal(shouldShowMapPool('bo3', false), true);
    assert.equal(shouldShowMapPool('bo1', false), false);
    assert.equal(shouldShowMapPool('bo1', true), true);
    assert.match(getMapPoolHint('bo3'), /5 mapas/);
    assert.match(getVetoFlowDescription('bo1', false), /registrar o resultado/);
    assert.equal(getVetoSteps('bo1', false).length, 0);
    assert.equal(getVetoSteps('bo3', true).length, 4);
    assert.equal(getVetoSteps('bo1', true).length, 3);
  });
});
