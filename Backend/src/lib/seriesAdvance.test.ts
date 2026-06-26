import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeBo3SeriesAfterMapWin } from './seriesAdvance';

const T1 = 'team-1';
const T2 = 'team-2';

describe('computeBo3SeriesAfterMapWin', () => {
  it('mapa 1 vencido não completa a série (1–0)', () => {
    const r = computeBo3SeriesAfterMapWin({
      team1Id: T1,
      team2Id: T2,
      winningTeamId: T1,
      team1MapWins: 0,
      team2MapWins: 0,
      activeGameNumber: 1,
    });
    assert.equal(r.completed, false);
    assert.equal(r.winnerId, null);
    assert.equal(r.team1MapWins, 1);
    assert.equal(r.team2MapWins, 0);
    assert.equal(r.activeGameNumber, 2);
  });

  it('2–0 completa a série a favor do team1', () => {
    const r = computeBo3SeriesAfterMapWin({
      team1Id: T1,
      team2Id: T2,
      winningTeamId: T1,
      team1MapWins: 1,
      team2MapWins: 0,
      activeGameNumber: 2,
    });
    assert.equal(r.completed, true);
    assert.equal(r.winnerId, T1);
    assert.equal(r.team1MapWins, 2);
    assert.equal(r.team2MapWins, 0);
  });

  it('2–1 completa a série a favor do team2', () => {
    const r = computeBo3SeriesAfterMapWin({
      team1Id: T1,
      team2Id: T2,
      winningTeamId: T2,
      team1MapWins: 1,
      team2MapWins: 1,
      activeGameNumber: 3,
    });
    assert.equal(r.completed, true);
    assert.equal(r.winnerId, T2);
    assert.equal(r.team1MapWins, 1);
    assert.equal(r.team2MapWins, 2);
  });

  it('1–1 após mapa 2 não completa — avança para mapa 3', () => {
    const r = computeBo3SeriesAfterMapWin({
      team1Id: T1,
      team2Id: T2,
      winningTeamId: T2,
      team1MapWins: 1,
      team2MapWins: 0,
      activeGameNumber: 2,
    });
    assert.equal(r.completed, false);
    assert.equal(r.team1MapWins, 1);
    assert.equal(r.team2MapWins, 1);
    assert.equal(r.activeGameNumber, 3);
  });

  it('vitória no mapa 3 com placar 1–1 define vencedor', () => {
    const r = computeBo3SeriesAfterMapWin({
      team1Id: T1,
      team2Id: T2,
      winningTeamId: T1,
      team1MapWins: 1,
      team2MapWins: 1,
      activeGameNumber: 3,
    });
    assert.equal(r.completed, true);
    assert.equal(r.winnerId, T1);
    assert.equal(r.team1MapWins, 2);
    assert.equal(r.team2MapWins, 1);
  });
});

describe('BO3 — cenários de bracket (lógica pura)', () => {
  it('simula série 2–0: bracket só avança após 2º mapa', () => {
    let state = { team1MapWins: 0, team2MapWins: 0, activeGameNumber: 1, bracketCanAdvance: false };

    const map1 = computeBo3SeriesAfterMapWin({
      team1Id: T1,
      team2Id: T2,
      winningTeamId: T1,
      team1MapWins: state.team1MapWins,
      team2MapWins: state.team2MapWins,
      activeGameNumber: state.activeGameNumber,
    });
    state = { ...state, ...map1, bracketCanAdvance: map1.completed };
    assert.equal(state.bracketCanAdvance, false);

    const map2 = computeBo3SeriesAfterMapWin({
      team1Id: T1,
      team2Id: T2,
      winningTeamId: T1,
      team1MapWins: state.team1MapWins,
      team2MapWins: state.team2MapWins,
      activeGameNumber: state.activeGameNumber,
    });
    state = { ...state, ...map2, bracketCanAdvance: map2.completed };
    assert.equal(state.bracketCanAdvance, true);
    assert.equal(map2.winnerId, T1);
  });
});
