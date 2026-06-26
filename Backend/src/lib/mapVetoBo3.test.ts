import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BO3_BANS_REQUIRED,
  BO3_PICKS_REQUIRED,
  bo3BansCompleted,
  bo3PicksCompleted,
  getBo3ActionTeam,
  getBo3SidePickTeam,
  resolveBo3MapAssignment,
} from './mapVetoBo3';
import { remainingMaps } from './mapVeto';

const TEAM1 = 'team-alpha';
const TEAM2 = 'team-beta';
const POOL = ['de_ancient', 'de_anubis', 'de_dust2', 'de_inferno', 'de_mirage'];

describe('mapVetoBo3 — fases e turnos', () => {
  it('exige 2 bans e 2 picks', () => {
    assert.equal(BO3_BANS_REQUIRED, 2);
    assert.equal(BO3_PICKS_REQUIRED, 2);
    assert.equal(bo3BansCompleted(2), true);
    assert.equal(bo3BansCompleted(1), false);
    assert.equal(bo3PicksCompleted(2), true);
    assert.equal(bo3PicksCompleted(1), false);
  });

  it('getBo3ActionTeam alterna ações como no BO1', () => {
    assert.equal(getBo3ActionTeam(TEAM1, TEAM2, 0), TEAM1);
    assert.equal(getBo3ActionTeam(TEAM1, TEAM2, 1), TEAM2);
    assert.equal(getBo3ActionTeam(TEAM1, TEAM2, 2), TEAM1);
    assert.equal(getBo3ActionTeam(TEAM1, TEAM2, 3), TEAM2);
  });

  it('getBo3SidePickTeam — mapa ímpar: adversário do firstAction; par: firstAction', () => {
    assert.equal(getBo3SidePickTeam(TEAM1, TEAM1, TEAM2, 1), TEAM2);
    assert.equal(getBo3SidePickTeam(TEAM1, TEAM1, TEAM2, 2), TEAM1);
    assert.equal(getBo3SidePickTeam(TEAM1, TEAM1, TEAM2, 3), TEAM2);
  });
});

describe('mapVetoBo3 — atribuição de mapas', () => {
  it('resolve 3 mapas após 2 bans e 2 picks', () => {
    const banned = ['de_ancient', 'de_anubis'];
    const picked = ['de_dust2', 'de_inferno'];
    const maps = resolveBo3MapAssignment(POOL, banned, picked);

    assert.ok(maps);
    assert.equal(maps!.map1, 'de_dust2');
    assert.equal(maps!.map2, 'de_inferno');
    assert.equal(maps!.map3, 'de_mirage');
  });

  it('retorna null se picks incompletos', () => {
    assert.equal(resolveBo3MapAssignment(POOL, [], ['de_dust2']), null);
  });

  it('decider é o único mapa restante após bans e picks', () => {
    const banned = ['de_ancient', 'de_anubis'];
    const picked = ['de_mirage', 'de_inferno'];
    const maps = resolveBo3MapAssignment(POOL, banned, picked);
    const remaining = remainingMaps(POOL, banned);
    const decider = remaining.find((m) => !picked.includes(m));
    assert.equal(maps!.map3, decider);
  });
});

describe('mapVetoBo3 — simulação de veto completo', () => {
  it('fluxo ban-ban-pick-pick com turnos corretos', () => {
    const firstAction = TEAM1;
    const other = TEAM2;
    const banned: string[] = [];
    const picked: string[] = [];
    const actions: { type: 'ban' | 'pick'; team: string; map: string }[] = [];

    for (let step = 0; step < BO3_BANS_REQUIRED; step++) {
      const turn = getBo3ActionTeam(firstAction, other, step);
      const available = remainingMaps(POOL, banned).filter((m) => !picked.includes(m));
      const map = available[0];
      banned.push(map);
      actions.push({ type: 'ban', team: turn, map });
    }

    assert.equal(bo3BansCompleted(banned.length), true);
    assert.equal(actions[0].team, TEAM1);
    assert.equal(actions[1].team, TEAM2);

    for (let pickIdx = 0; pickIdx < BO3_PICKS_REQUIRED; pickIdx++) {
      const stepIndex = BO3_BANS_REQUIRED + pickIdx;
      const turn = getBo3ActionTeam(firstAction, other, stepIndex);
      const available = remainingMaps(POOL, banned).filter((m) => !picked.includes(m));
      const map = available[0];
      picked.push(map);
      actions.push({ type: 'pick', team: turn, map });
    }

    assert.equal(bo3PicksCompleted(picked.length), true);
    assert.equal(actions[2].team, TEAM1);
    assert.equal(actions[3].team, TEAM2);

    const assignment = resolveBo3MapAssignment(POOL, banned, picked);
    assert.ok(assignment);
    assert.deepEqual([assignment!.map1, assignment!.map2, assignment!.map3], [
      picked[0],
      picked[1],
      remainingMaps(POOL, banned).find((m) => !picked.includes(m)),
    ]);
  });
});
