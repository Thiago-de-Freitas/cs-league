import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatSeriesMapWins,
  isBo3Match,
  showMatchMapVeto,
  showSeriesVetoPanel,
} from './match-series-view.util';

describe('match-series-view.util', () => {
  it('isBo3Match pela série ou pela liga', () => {
    assert.equal(isBo3Match({ seriesFormat: 'bo3' }), true);
    assert.equal(isBo3Match({ leagueSeriesFormat: 'bo3' }), true);
    assert.equal(isBo3Match({ seriesFormat: 'bo1', leagueSeriesFormat: 'bo1' }), false);
  });

  it('showSeriesVetoPanel só na fase ban/pick do BO3', () => {
    assert.equal(showSeriesVetoPanel({ format: 'bo3', vetoStatus: 'ban_phase' }), true);
    assert.equal(showSeriesVetoPanel({ format: 'bo3', vetoStatus: 'pick_phase' }), true);
    assert.equal(showSeriesVetoPanel({ format: 'bo3', vetoStatus: 'maps_assigned' }), false);
    assert.equal(showSeriesVetoPanel({ format: 'bo1', vetoStatus: 'ban_phase' }), false);
    assert.equal(showSeriesVetoPanel(null), false);
  });

  it('showMatchMapVeto — BO3 usa veto por mapa após assign; BO1 sempre com veto', () => {
    assert.equal(
      showMatchMapVeto({
        mapVetoEnabled: true,
        isBo3: true,
        seriesVetoStatus: 'ban_phase',
        hasMapVeto: true,
      }),
      false
    );
    assert.equal(
      showMatchMapVeto({
        mapVetoEnabled: true,
        isBo3: true,
        seriesVetoStatus: 'maps_assigned',
        hasMapVeto: true,
      }),
      true
    );
    assert.equal(
      showMatchMapVeto({
        mapVetoEnabled: true,
        isBo3: false,
        hasMapVeto: false,
      }),
      true
    );
    assert.equal(
      showMatchMapVeto({
        mapVetoEnabled: false,
        isBo3: false,
      }),
      false
    );
  });

  it('formatSeriesMapWins', () => {
    assert.equal(formatSeriesMapWins(1, 0), '1 – 0');
    assert.equal(formatSeriesMapWins(null, 0), '');
  });
});
