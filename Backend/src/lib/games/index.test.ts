import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getGameConfig, parseMapPoolForGame, validateMapPoolForSeriesFormat } from './index';
import { calcRatingForGame } from '../rankings';
import { pubgPointsForPlacement } from './matchScoring';

describe('games registry', () => {
  it('lista CS2 como padrão', () => {
    const cs2 = getGameConfig('CS2');
    assert.equal(cs2.id, 'CS2');
    assert.equal(cs2.supportsDemoUpload, true);
  });

  it('Valorant usa Riot API e mapas próprios', () => {
    const val = getGameConfig('VALORANT');
    assert.equal(val.statsIngestion, 'RIOT_API');
    assert.ok(isValidValorantMap('bind'));
    assert.equal(parseMapPoolForGame(['bind', 'haven'], 'VALORANT').length, 2);
  });

  it('LoL exige BO5 com 7 mapas no pool', () => {
    const pool = parseMapPoolForGame(['summoners_rift'], 'LOL');
    assert.deepEqual(pool, ['summoners_rift']);
    const err = validateMapPoolForSeriesFormat(
      ['summoners_rift', 'summoners_rift', 'summoners_rift', 'summoners_rift', 'summoners_rift', 'summoners_rift'],
      'BO5',
      'LOL'
    );
    assert.match(err ?? '', /pelo menos 7/);
  });

  it('PUBG usa formato points race', () => {
    const pubg = getGameConfig('PUBG');
    assert.equal(pubg.scoringMode, 'PLACEMENT_POINTS');
    assert.equal(pubg.defaultTeamSize, 4);
    assert.equal(pubgPointsForPlacement(1), 15);
  });

  it('calcRatingForGame adapta métricas por jogo', () => {
    assert.ok(calcRatingForGame('VALORANT', 1.2, 0, 0, 0, { acs: 240 }) > 0);
    assert.ok(calcRatingForGame('LOL', 3, 0, 0, 0, { cs: 180, visionScore: 25 }) > 0);
  });
});

function isValidValorantMap(mapId: string): boolean {
  return getGameConfig('VALORANT').allMaps.includes(mapId);
}
