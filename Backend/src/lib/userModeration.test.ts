import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canUserLogin,
  canUserParticipate,
  computeBannedUntil,
  isParticipationBanned,
  parseBanDays,
} from './userModeration';

describe('userModeration', () => {
  it('conta desativada não pode logar nem participar', () => {
    const user = { isActive: false, bannedUntil: null };
    assert.equal(canUserLogin(user), false);
    assert.equal(canUserParticipate(user), false);
  });

  it('ban temporário bloqueia participação mas permite login', () => {
    const future = new Date(Date.now() + 86_400_000);
    const user = { isActive: true, bannedUntil: future };
    assert.equal(canUserLogin(user), true);
    assert.equal(canUserParticipate(user), false);
    assert.equal(isParticipationBanned(user), true);
  });

  it('ban expirado libera participação', () => {
    const past = new Date(Date.now() - 86_400_000);
    const user = { isActive: true, bannedUntil: past };
    assert.equal(isParticipationBanned(user), false);
    assert.equal(canUserParticipate(user), true);
  });

  it('parseBanDays valida intervalo', () => {
    assert.equal(parseBanDays(7), 7);
    assert.equal(parseBanDays(0), null);
    assert.equal(parseBanDays(400), null);
  });

  it('computeBannedUntil soma dias', () => {
    const from = new Date('2025-06-01T12:00:00Z');
    const until = computeBannedUntil(3, from);
    assert.equal(until.toISOString(), '2025-06-04T12:00:00.000Z');
  });
});
