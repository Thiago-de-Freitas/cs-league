/// <reference types="node" />

import { describe, it } from 'node:test';
import * as assert from 'assert/strict';
import { formatBuildLabel, formatVersionCore, getBuildInfo } from './buildInfo';

describe('buildInfo', () => {
  it('retorna metadados com campos obrigatórios', () => {
    const info = getBuildInfo();
    assert.equal(info.component, 'backend');
    assert.ok(info.name);
    assert.ok(info.version);
    assert.ok(info.commit);
    assert.ok(info.buildTime);
    assert.equal(typeof info.dirty, 'boolean');
    assert.equal(typeof info.commitCount, 'number');
    assert.equal(typeof info.commitsSinceVersion, 'number');
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
      commitCount: 142,
      commitsSinceVersion: 8,
      versionTag: 'v1.2.3',
      commitSubject: 'feat: analytics',
    });
    assert.equal(label, 'v1.2.3+142 (abc1234)');
  });

  it('formata versão principal com contagem de commits', () => {
    assert.equal(formatVersionCore({ version: '1.1.0', commitCount: 142 }), 'v1.1.0+142');
  });

  it('marca dirty no label', () => {
    const label = formatBuildLabel({
      component: 'backend',
      name: 'gamers-league-api',
      version: '1.1.0',
      commit: 'deadbeef',
      commitFull: 'deadbeef',
      branch: 'main',
      buildTime: '2026-01-01T00:00:00.000Z',
      dirty: true,
      commitCount: 142,
      commitsSinceVersion: 142,
      versionTag: null,
      commitSubject: 'Correções',
    });
    assert.equal(label, 'v1.1.0+142 (deadbeef-dirty)');
  });
});
