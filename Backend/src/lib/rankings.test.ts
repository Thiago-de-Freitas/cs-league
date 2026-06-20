import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calcRating } from './rankings';

describe('calcRating', () => {
  it('returns higher rating for stronger stats', () => {
    const strong = calcRating(1.5, 90, 80, 50);
    const weak = calcRating(0.8, 60, 60, 30);
    assert.ok(strong > weak);
  });

  it('handles zero deaths kd edge case via caller', () => {
    const rating = calcRating(2, 85, 75, 40);
    assert.ok(rating > 0 && rating < 5);
  });
});
