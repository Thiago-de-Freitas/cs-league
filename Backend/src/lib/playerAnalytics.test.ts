import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildPersonalPerformanceAnalytics,
  buildPerformanceInsights,
  computePerformanceRating,
  computeSkillRatings,
  findTopMapInsight,
} from './playerAnalytics';

describe('playerAnalytics', () => {
  const baseStat = {
    kills: 20,
    deaths: 15,
    assists: 6,
    damage: 1950,
    adr: 75,
    hsPercent: 48,
    kast: 74,
    analytics: {
      map: 'de_mirage',
      sides: {
        ct: { kills: 12, deaths: 6, damage: 1100, rounds: 13 },
        t: { kills: 8, deaths: 9, damage: 850, rounds: 13 },
      },
      utility: { heDamage: 180, molotovDamage: 90, flashAssists: 2 },
      combat: { tradeKills: 5, tradedDeaths: 3, openingKills: 4, openingDeaths: 2 },
    },
  } as const;

  it('computeSkillRatings retorna valores entre 0 e 100', () => {
    const skills = computeSkillRatings(baseStat);
    assert.ok(skills.aim >= 0 && skills.aim <= 100);
    assert.ok(skills.positioning >= 0 && skills.positioning <= 100);
    assert.ok(skills.utility >= 0 && skills.utility <= 100);
  });

  it('computePerformanceRating produz valor negativo ou positivo conforme impacto', () => {
    const strong = computePerformanceRating({ ...baseStat, kills: 30, deaths: 10, adr: 95, kast: 80 });
    const weak = computePerformanceRating({ ...baseStat, kills: 8, deaths: 22, adr: 55, kast: 58 });
    assert.ok(strong > weak);
  });

  it('buildPerformanceInsights inclui cards de aim, HE e trade', () => {
    const skills = computeSkillRatings(baseStat);
    const insights = buildPerformanceInsights(baseStat, skills, baseStat.analytics);
    assert.ok(insights.some((item) => item.id === 'aim'));
    assert.ok(insights.some((item) => item.id === 'he-usage'));
    assert.ok(insights.some((item) => item.id === 'trade-fragging'));
    assert.ok(insights.some((item) => item.id === 'ct-map'));
  });

  it('buildPersonalPerformanceAnalytics agrega demos concluídas', () => {
    const analytics = buildPersonalPerformanceAnalytics([
      {
        demoId: 'd1',
        fileName: 'a.dem',
        createdAt: new Date('2025-06-01T12:00:00Z'),
        stat: baseStat,
      },
      {
        demoId: 'd2',
        fileName: 'b.dem',
        createdAt: new Date('2025-06-02T12:00:00Z'),
        stat: { ...baseStat, kills: 18, deaths: 16 },
      },
    ]);

    assert.ok(analytics);
    assert.equal(analytics.recentForm.length, 2);
    assert.ok(analytics.recentForm[0].skills.aim >= 0);
    assert.ok(analytics.recentForm[1].skills.positioning >= 0);
    assert.ok(analytics.insights.length >= 3);
    assert.equal(analytics.skillsGoal.aim, 50);
  });

  it('findTopMapInsight escolhe melhor mapa/lado', () => {
    const top = findTopMapInsight([
      baseStat.analytics,
      {
        map: 'de_inferno',
        sides: { ct: { kills: 4, deaths: 10, damage: 400, rounds: 12 } },
      },
    ]);
    assert.ok(top);
    assert.equal(top?.name, 'Mirage');
  });
});
