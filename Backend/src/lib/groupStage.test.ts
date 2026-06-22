import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  distributeTeamsIntoGroups,
  generateRoundRobinPairings,
  computeGroupStandings,
  getQualifiersFromGroups,
  validateGroupStageConfig,
  countRoundRobinMatches,
  isCompleteRoundRobin,
} from './groupStage';

describe('distributeTeamsIntoGroups', () => {
  it('distribui 8 times em 2 grupos com snake draft', () => {
    const teams = Array.from({ length: 8 }, (_, i) => ({
      teamId: `t${i + 1}`,
      wins: 0,
      losses: 0,
      points: 0,
      seed: i + 1,
    }));

    const groups = distributeTeamsIntoGroups(teams, 2);
    assert.equal(groups.length, 2);
    assert.equal(groups[0].name, 'A');
    assert.equal(groups[1].name, 'B');
    assert.deepEqual(groups[0].teamIds, ['t1', 't4', 't5', 't8']);
    assert.deepEqual(groups[1].teamIds, ['t2', 't3', 't6', 't7']);
  });

  it('coloca todos os times em um único grupo', () => {
    const teams = Array.from({ length: 6 }, (_, i) => ({
      teamId: `t${i + 1}`,
      wins: 0,
      losses: 0,
      points: 0,
      seed: i + 1,
    }));

    const groups = distributeTeamsIntoGroups(teams, 1);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].teamIds.length, 6);
  });
});

describe('generateRoundRobinPairings', () => {
  it('gera todos os confrontos para 4 times', () => {
    const pairings = generateRoundRobinPairings(['a', 'b', 'c', 'd']);
    assert.equal(pairings.length, 6);
    assert.equal(isCompleteRoundRobin(['a', 'b', 'c', 'd'], pairings), true);
  });

  it('cada time enfrenta todos os outros exatamente uma vez (3 a 10 times)', () => {
    for (let n = 3; n <= 10; n++) {
      const teams = Array.from({ length: n }, (_, i) => `t${i}`);
      const pairings = generateRoundRobinPairings(teams);
      assert.equal(pairings.length, countRoundRobinMatches(n));
      assert.equal(isCompleteRoundRobin(teams, pairings), true);
    }
  });
});

describe('computeGroupStandings', () => {
  it('ordena por pontos', () => {
    const standings = computeGroupStandings(['a', 'b', 'c'], [
      { team1Id: 'a', team2Id: 'b', winnerId: 'a', status: 'COMPLETED' },
      { team1Id: 'a', team2Id: 'c', winnerId: 'c', status: 'COMPLETED' },
      { team1Id: 'b', team2Id: 'c', winnerId: 'b', status: 'COMPLETED' },
    ]);
    assert.equal(standings[0].teamId, 'a');
    assert.equal(standings[0].points, 3);
    assert.equal(standings[0].rank, 1);
  });
});

describe('getQualifiersFromGroups', () => {
  it('seleciona top 2 de cada grupo', () => {
    const groups = [
      { name: 'A', order: 0, teamIds: ['a1', 'a2', 'a3'] },
      { name: 'B', order: 1, teamIds: ['b1', 'b2', 'b3'] },
    ];
    const standings = new Map([
      ['A', [
        { teamId: 'a1', wins: 2, losses: 0, points: 6, played: 2, rank: 1 },
        { teamId: 'a2', wins: 1, losses: 1, points: 3, played: 2, rank: 2 },
        { teamId: 'a3', wins: 0, losses: 2, points: 0, played: 2, rank: 3 },
      ]],
      ['B', [
        { teamId: 'b1', wins: 2, losses: 0, points: 6, played: 2, rank: 1 },
        { teamId: 'b2', wins: 1, losses: 1, points: 3, played: 2, rank: 2 },
        { teamId: 'b3', wins: 0, losses: 2, points: 0, played: 2, rank: 3 },
      ]],
    ]);

    const qualifiers = getQualifiersFromGroups(groups, standings, 2);
    assert.deepEqual(qualifiers, ['a1', 'b1', 'a2', 'b2']);
  });
});

describe('validateGroupStageConfig', () => {
  it('rejeita poucos times para vários grupos', () => {
    const result = validateGroupStageConfig(3, 2, 2);
    assert.equal(result.valid, false);
  });

  it('aceita grupo único com 6 times e top 4', () => {
    const result = validateGroupStageConfig(6, 1, 4);
    assert.equal(result.valid, true);
  });

  it('aceita configuração válida com vários grupos', () => {
    const result = validateGroupStageConfig(8, 2, 2);
    assert.equal(result.valid, true);
  });
});
