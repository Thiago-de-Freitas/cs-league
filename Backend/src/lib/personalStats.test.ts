import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildPersonalStatsOverview, serializePublicPersonalStatsOverview } from './personalStats';

describe('personalStats', () => {
  it('buildPersonalStatsOverview agrega apenas demos concluídas', () => {
    const overview = buildPersonalStatsOverview([
      {
        id: 'd1',
        fileName: 'done.dem',
        status: 'COMPLETED',
        createdAt: new Date('2025-06-01T12:00:00Z'),
        stats: [
          {
            kills: 20,
            deaths: 10,
            adr: 80,
            hsPercent: 40,
            kast: 70,
          } as never,
        ],
      },
      {
        id: 'd2',
        fileName: 'pending.dem',
        status: 'PENDING',
        createdAt: new Date('2025-06-02T12:00:00Z'),
        stats: [],
      },
    ]);

    assert.equal(overview.summary.demosTotal, 2);
    assert.equal(overview.summary.demosCompleted, 1);
    assert.equal(overview.summary.kills, 20);
    assert.equal(overview.summary.deaths, 10);
    assert.equal(overview.demos.length, 2);
    assert.equal(overview.demos[0].status, 'completed');
    assert.equal(overview.demos[1].status, 'pending');
  });

  it('serializePublicPersonalStatsOverview retorna null sem demos concluídas', () => {
    const overview = buildPersonalStatsOverview([
      {
        id: 'd1',
        fileName: 'pending.dem',
        status: 'PENDING',
        createdAt: new Date('2025-06-02T12:00:00Z'),
        stats: [],
      },
    ]);

    assert.equal(serializePublicPersonalStatsOverview(overview), null);
  });

  it('serializePublicPersonalStatsOverview expõe só demos concluídas com datas ISO', () => {
    const overview = buildPersonalStatsOverview([
      {
        id: 'd1',
        fileName: 'done.dem',
        status: 'COMPLETED',
        createdAt: new Date('2025-06-01T12:00:00Z'),
        stats: [{ kills: 20, deaths: 10, adr: 80, hsPercent: 40, kast: 70 } as never],
      },
      {
        id: 'd2',
        fileName: 'pending.dem',
        status: 'PROCESSING',
        createdAt: new Date('2025-06-02T12:00:00Z'),
        stats: [],
      },
    ]);

    const serialized = serializePublicPersonalStatsOverview(overview);
    assert.ok(serialized);
    assert.equal(serialized.demos.length, 1);
    assert.equal(serialized.demos[0].demoId, 'd1');
    assert.equal(serialized.demos[0].createdAt, '2025-06-01T12:00:00.000Z');
    assert.equal(serialized.summary.demosCompleted, 1);
  });
});
