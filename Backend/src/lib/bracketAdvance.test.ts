import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeWalkoverWinners } from './bracket';

describe('bracket walkover advance (semifinal)', () => {
  it('permite semifinal 1 quando seed 1 tem BYE e posição 2 tem vencedor', () => {
    const seedToTeam = new Map<number, string>([
      [1, 'bt'],
      [2, 'aa'],
      [3, 'ck'],
      [4, 'bb'],
      [5, 'cw'],
    ]);
    const walkovers = computeWalkoverWinners(seedToTeam, 8);

    const winnerAt = (pos: number, completed: Map<number, string>) => {
      if (completed.has(pos)) return completed.get(pos)!;
      return walkovers.get(pos) ?? null;
    };

    const completed = new Map<number, string>([[2, 'aa']]);
    const w1 = winnerAt(1, completed);
    const w2 = winnerAt(2, completed);

    assert.equal(w1, 'bt');
    assert.equal(w2, 'aa');
  });

  it('walkover do seed 1 não muda após vitórias de outros times (usa seed fixo)', () => {
    const seedToTeam = new Map<number, string>([
      [1, 'retk'],
      [2, 'g2'],
      [3, 'furia'],
      [4, 'faze'],
      [5, 'imp'],
      [6, 'leg'],
      [7, 'mouz'],
    ]);
    const walkovers = computeWalkoverWinners(seedToTeam, 8);
    assert.equal(walkovers.get(1), 'retk');
    assert.equal(walkovers.get(1), 'retk');
  });
});
