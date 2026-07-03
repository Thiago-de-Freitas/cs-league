import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BASE_POINTS,
  LEVEL_THRESHOLDS,
  MAX_LEVEL,
  computeStatPoints,
  levelFromPoints,
  resolveMatchOutcome,
} from './playerRankingPoints';

describe('playerRankingPoints', () => {
  const baseStat = {
    kills: 20,
    deaths: 15,
    hsPercent: 50,
    analytics: {
      combat: { openingKills: 4, tradeKills: 3 },
    },
  } as const;

  it('computeStatPoints soma base + desempenho', () => {
    const { points, breakdown } = computeStatPoints(baseStat, 'win');
    // base 25 + kills 20 + hs 5 + opening 8 + trade 3 - deaths 7.5 = 53.5 -> 54
    assert.equal(points, 54);
    assert.equal(breakdown.base, BASE_POINTS.win);
    assert.equal(breakdown.outcome, 'win');
  });

  it('vitória vale mais que derrota para o mesmo desempenho', () => {
    const win = computeStatPoints(baseStat, 'win').points;
    const loss = computeStatPoints(baseStat, 'loss').points;
    assert.ok(win > loss);
    assert.equal(win - loss, BASE_POINTS.win - BASE_POINTS.loss);
  });

  it('demo sem partida não recebe base', () => {
    const { breakdown } = computeStatPoints(baseStat, 'none');
    assert.equal(breakdown.base, 0);
  });

  it('total tem piso 0 mesmo com muitas mortes', () => {
    const { points } = computeStatPoints(
      { kills: 0, deaths: 40, hsPercent: 0, analytics: null },
      'loss'
    );
    assert.equal(points, 0);
  });

  it('ignora valores negativos/ausentes nas métricas', () => {
    const { points } = computeStatPoints(
      { kills: 10, deaths: 5, hsPercent: 30, analytics: undefined },
      'draw'
    );
    // base 10 + 10 + 3 + 0 + 0 - 2.5 = 20.5 -> 21
    assert.equal(points, 21);
  });

  it('levelFromPoints respeita as fronteiras das faixas', () => {
    assert.equal(levelFromPoints(0), 1);
    assert.equal(levelFromPoints(-100), 1);
    assert.equal(levelFromPoints(LEVEL_THRESHOLDS[1] - 1), 1);
    assert.equal(levelFromPoints(LEVEL_THRESHOLDS[1]), 2);
    assert.equal(levelFromPoints(LEVEL_THRESHOLDS[MAX_LEVEL - 1]), MAX_LEVEL);
    assert.equal(levelFromPoints(LEVEL_THRESHOLDS[MAX_LEVEL - 1] + 999999), MAX_LEVEL);
  });

  it('resolveMatchOutcome mapeia vitória/derrota pelo teamId', () => {
    const demo = {
      matchId: 'm1',
      match: { winnerId: 'teamA', team1Id: 'teamA', team2Id: 'teamB' },
    };
    assert.equal(resolveMatchOutcome(demo, 'teamA'), 'win');
    assert.equal(resolveMatchOutcome(demo, 'teamB'), 'loss');
    assert.equal(resolveMatchOutcome(demo, null), 'draw');
  });

  it('resolveMatchOutcome retorna none sem partida e draw sem vencedor', () => {
    assert.equal(resolveMatchOutcome({ matchId: null, match: null }, 'teamA'), 'none');
    assert.equal(
      resolveMatchOutcome(
        { matchId: 'm1', match: { winnerId: null, team1Id: 'teamA', team2Id: 'teamB' } },
        'teamA'
      ),
      'draw'
    );
  });
});
