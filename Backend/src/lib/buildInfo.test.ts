import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatBuildLabel, getBuildInfo } from './buildInfo';

describe('buildInfo', () => {
  it('retorna metadados com campos obrigatórios', () => {
    const info = getBuildInfo();
    assert.equal(info.component, 'backend');
    assert.ok(info.name);
    assert.ok(info.version);
    assert.ok(info.commit);
    assert.ok(info.buildTime);
    assert.equal(typeof info.dirty, 'boolean');
  });

  it('formata label legível', () => {
    const label = formatBuildLabel({
      component: 'backend',
      name: 'gamers-league-api',
      version: '1.2.3',
      commit: 'abc1234',
      commitFull: 'abc1234567890',
      branch: 'main',
      buildTime: '2026-01-01T00:00:00.000Z',
      dirty: false,
    });
    assert.equal(label, 'v1.2.3 (abc1234)');
  });

  it('marca dirty no label', () => {
    const label = formatBuildLabel({
      component: 'backend',
      name: 'gamers-league-api',
      version: '1.0.0',
      commit: 'deadbeef',
      commitFull: 'deadbeef',
      branch: 'main',
      buildTime: '2026-01-01T00:00:00.000Z',
      dirty: true,
    });
    assert.equal(label, 'v1.0.0 (deadbeef-dirty)');
  });
});
