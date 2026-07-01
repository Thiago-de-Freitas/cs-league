import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildSmoothAreaPath, buildSmoothLinePath, mapValueToChartY } from './growth-chart.util';

describe('growth-chart.util', () => {
  it('mapValueToChartY respeita min, max e padding vertical', () => {
    assert.ok(Math.abs(mapValueToChartY(0, 0, 100) - 45) < 0.1);
    assert.ok(Math.abs(mapValueToChartY(100, 0, 100) - 5) < 0.1);
    assert.ok(Math.abs(mapValueToChartY(50, 0, 100) - 25) < 0.1);
  });

  it('buildSmoothLinePath gera segmento reto com dois pontos', () => {
    assert.equal(buildSmoothLinePath([{ x: 0, y: 10 }, { x: 100, y: 20 }]), 'M 0,10 L 100,20');
  });

  it('buildSmoothLinePath gera curva com três ou mais pontos', () => {
    const path = buildSmoothLinePath([
      { x: 0, y: 30 },
      { x: 50, y: 10 },
      { x: 100, y: 25 },
    ]);
    assert.ok(path.startsWith('M 0,30'));
    assert.ok(path.includes('C'));
    assert.ok(path.endsWith('25'));
  });

  it('buildSmoothAreaPath fecha a área na base do gráfico', () => {
    const path = buildSmoothAreaPath(
      [
        { x: 4, y: 20 },
        { x: 96, y: 12 },
      ],
      50
    );
    assert.ok(path.includes('L 96,50'));
    assert.ok(path.includes('L 4,50'));
    assert.ok(path.endsWith('Z'));
  });
});
