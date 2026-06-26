import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolvePlayoffSlotPlan, resolveBracketSlotWinner } from './playoffMatchFactory';

describe('resolvePlayoffSlotPlan', () => {
  it('BO1 sem veto → partida única (sem série)', () => {
    const plan = resolvePlayoffSlotPlan({
      seriesFormat: 'BO1',
      mapPool: null,
      mapVetoEnabled: false,
    });
    assert.deepEqual(plan, { useSeries: false, format: 'BO1', gameCount: 1 });
  });

  it('BO1 com veto → série BO1 com 1 jogo', () => {
    const plan = resolvePlayoffSlotPlan({
      seriesFormat: 'BO1',
      mapPool: null,
      mapVetoEnabled: true,
    });
    assert.deepEqual(plan, { useSeries: true, format: 'BO1', gameCount: 1 });
  });

  it('BO3 → série com 3 jogos e veto obrigatório (useSeries true)', () => {
    const plan = resolvePlayoffSlotPlan({
      seriesFormat: 'BO3',
      mapPool: null,
      mapVetoEnabled: true,
    });
    assert.deepEqual(plan, { useSeries: true, format: 'BO3', gameCount: 3 });
  });

  it('BO3 com mapVetoEnabled false ainda usa série (formato manda)', () => {
    const plan = resolvePlayoffSlotPlan({
      seriesFormat: 'BO3',
      mapPool: null,
      mapVetoEnabled: false,
    });
    assert.deepEqual(plan, { useSeries: true, format: 'BO3', gameCount: 3 });
  });
});

describe('resolveBracketSlotWinner', () => {
  const LEAGUE = 'league-1';
  const ROUND = 1;
  const POS = 1;
  const SERIES_ID = 'series-1';
  const T1 = 'team-1';
  const T2 = 'team-2';

  function mockDb(state: {
    matches: {
      id: string;
      winnerId: string | null;
      status: string;
      seriesId: string | null;
      seriesGameNumber: number | null;
    }[];
    series: { id: string; status: string; winnerId: string | null } | null;
  }) {
    return {
      match: {
        findMany: async () =>
          state.matches.filter(
            (m) => true // query simplificada — todos os matches do slot
          ),
      },
      matchSeries: {
        findUnique: async ({ where }: { where: { id: string } }) =>
          state.series?.id === where.id ? state.series : null,
      },
    };
  }

  it('walkover tem prioridade sobre partida no slot', async () => {
    const db = mockDb({ matches: [], series: null });
    const winner = await resolveBracketSlotWinner(db as never, LEAGUE, ROUND, POS, T1);
    assert.equal(winner, T1);
  });

  it('BO3: mapa 1 vencido não define vencedor do slot (série em andamento)', async () => {
    const db = mockDb({
      matches: [
        { id: 'm1', winnerId: T1, status: 'COMPLETED', seriesId: SERIES_ID, seriesGameNumber: 1 },
        { id: 'm2', winnerId: null, status: 'SCHEDULED', seriesId: SERIES_ID, seriesGameNumber: 2 },
        { id: 'm3', winnerId: null, status: 'SCHEDULED', seriesId: SERIES_ID, seriesGameNumber: 3 },
      ],
      series: { id: SERIES_ID, status: 'IN_PROGRESS', winnerId: null },
    });
    const winner = await resolveBracketSlotWinner(db as never, LEAGUE, ROUND, POS, null);
    assert.equal(winner, null);
  });

  it('BO3: série completa retorna winnerId da série', async () => {
    const db = mockDb({
      matches: [
        { id: 'm1', winnerId: T1, status: 'COMPLETED', seriesId: SERIES_ID, seriesGameNumber: 1 },
        { id: 'm2', winnerId: T1, status: 'COMPLETED', seriesId: SERIES_ID, seriesGameNumber: 2 },
      ],
      series: { id: SERIES_ID, status: 'COMPLETED', winnerId: T1 },
    });
    const winner = await resolveBracketSlotWinner(db as never, LEAGUE, ROUND, POS, null);
    assert.equal(winner, T1);
  });

  it('BO1 sem série: partida completa retorna winnerId da partida', async () => {
    const db = mockDb({
      matches: [
        { id: 'm1', winnerId: T2, status: 'COMPLETED', seriesId: null, seriesGameNumber: null },
      ],
      series: null,
    });
    const winner = await resolveBracketSlotWinner(db as never, LEAGUE, ROUND, POS, null);
    assert.equal(winner, T2);
  });

  it('BO1 sem série: partida agendada não retorna vencedor', async () => {
    const db = mockDb({
      matches: [
        { id: 'm1', winnerId: null, status: 'SCHEDULED', seriesId: null, seriesGameNumber: null },
      ],
      series: null,
    });
    const winner = await resolveBracketSlotWinner(db as never, LEAGUE, ROUND, POS, null);
    assert.equal(winner, null);
  });
});
