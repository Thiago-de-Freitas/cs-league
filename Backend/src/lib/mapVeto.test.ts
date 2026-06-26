import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyStartingSides,
  bansRequiredForPool,
  buildMapVetoView,
  getBanTeamForStep,
  getOtherTeamId,
  getSidePickTeamId,
  remainingMaps,
} from './mapVeto';
import { DEFAULT_CS2_MAP_POOL } from './cs2Maps';

const TEAM1 = 'team-alpha';
const TEAM2 = 'team-beta';
const POOL = [...DEFAULT_CS2_MAP_POOL];

describe('mapVeto BO1 — funções puras', () => {
  it('getOtherTeamId retorna o adversário', () => {
    assert.equal(getOtherTeamId(TEAM1, TEAM2, TEAM1), TEAM2);
    assert.equal(getOtherTeamId(TEAM1, TEAM2, TEAM2), TEAM1);
  });

  it('getBanTeamForStep alterna entre primeiro ban e adversário', () => {
    assert.equal(getBanTeamForStep(TEAM1, TEAM2, 0), TEAM1);
    assert.equal(getBanTeamForStep(TEAM1, TEAM2, 1), TEAM2);
    assert.equal(getBanTeamForStep(TEAM1, TEAM2, 2), TEAM1);
    assert.equal(getBanTeamForStep(TEAM1, TEAM2, 5), TEAM2);
  });

  it('bansRequiredForPool exige poolSize - 1 bans', () => {
    assert.equal(bansRequiredForPool(7), 6);
    assert.equal(bansRequiredForPool(5), 4);
    assert.equal(bansRequiredForPool(2), 1);
    assert.equal(bansRequiredForPool(1), 0);
  });

  it('remainingMaps remove mapas banidos preservando ordem', () => {
    const banned = ['de_dust2', 'de_mirage'];
    const rem = remainingMaps(POOL, banned);
    assert.equal(rem.length, POOL.length - 2);
    assert.ok(!rem.includes('de_dust2'));
    assert.ok(!rem.includes('de_mirage'));
  });

  it('getSidePickTeamId — adversário de quem fez o último ban escolhe o lado', () => {
    assert.equal(getSidePickTeamId(TEAM1, TEAM2, 1), TEAM2);
    assert.equal(getSidePickTeamId(TEAM1, TEAM2, 2), TEAM1);
    assert.equal(getSidePickTeamId(TEAM1, TEAM2, 6), TEAM1);
  });

  it('applyStartingSides atribui CT/T corretamente para team1 e team2', () => {
    const t1PicksCt = applyStartingSides(TEAM1, TEAM1, TEAM2, 'CT');
    assert.equal(t1PicksCt.team1StartingSide, 'CT');
    assert.equal(t1PicksCt.team2StartingSide, 'T');

    const t2PicksT = applyStartingSides(TEAM2, TEAM1, TEAM2, 'T');
    assert.equal(t2PicksT.team1StartingSide, 'CT');
    assert.equal(t2PicksT.team2StartingSide, 'T');
  });
});

describe('mapVeto BO1 — simulação completa de veto (pool 7)', () => {
  it('6 bans alternados deixam exatamente 1 mapa e entram em SIDE_PHASE', () => {
    const firstBan = TEAM1;
    const other = TEAM2;
    let banned: string[] = [];
    const bansRequired = bansRequiredForPool(POOL.length);

    for (let i = 0; i < bansRequired; i++) {
      const turn = getBanTeamForStep(firstBan, other, i);
      const rem = remainingMaps(POOL, banned);
      assert.ok(rem.length > 1, `ainda deve haver mapas para banir no passo ${i}`);
      const mapToBan = rem[0];
      banned = [...banned, mapToBan];
    }

    const finalRemaining = remainingMaps(POOL, banned);
    assert.equal(finalRemaining.length, 1);
    assert.equal(banned.length, 6);

    const sidePicker = getSidePickTeamId(firstBan, other, banned.length);
    assert.equal(sidePicker, TEAM1);

    const view = buildMapVetoView({
      mapPool: POOL,
      bannedMaps: banned,
      firstBanTeamId: firstBan,
      team1Id: TEAM1,
      team2Id: TEAM2,
      vetoTurnTeamId: null,
      sidePickTeamId: sidePicker,
      status: 'SIDE_PHASE',
      selectedMap: finalRemaining[0],
      team1StartingSide: null,
      team2StartingSide: null,
      lastActionAt: new Date(),
    });

    assert.equal(view.status, 'SIDE_PHASE');
    assert.equal(view.selectedMap, finalRemaining[0]);
    assert.equal(view.bansCompleted, 6);
    assert.equal(view.bansRequired, 6);
  });

  it('buildMapVetoView marca stale após timeout', () => {
    const staleAt = new Date('2020-01-01T00:00:00Z');
    const now = new Date('2020-01-01T01:00:00Z');
    const view = buildMapVetoView({
      mapPool: POOL,
      bannedMaps: [],
      firstBanTeamId: TEAM1,
      team1Id: TEAM1,
      team2Id: TEAM2,
      vetoTurnTeamId: TEAM1,
      sidePickTeamId: null,
      status: 'BAN_PHASE',
      selectedMap: null,
      team1StartingSide: null,
      team2StartingSide: null,
      lastActionAt: staleAt,
      now,
    });
    assert.equal(view.isStale, true);
  });
});
