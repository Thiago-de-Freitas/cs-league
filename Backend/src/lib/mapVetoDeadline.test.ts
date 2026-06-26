import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildVetoDeadlineInfo,
  getVetoDeadlineAt,
  isVetoActionAllowed,
  VETO_DEADLINE_MS,
} from './mapVetoDeadline';

describe('mapVetoDeadline', () => {
  const matchStart = new Date('2026-06-26T18:00:00.000Z');

  it('calcula prazo 48h antes do agendamento', () => {
    const deadline = getVetoDeadlineAt(matchStart);
    assert.equal(deadline?.getTime(), matchStart.getTime() - VETO_DEADLINE_MS);
  });

  it('marca deadlineExpired após o prazo', () => {
    const before = buildVetoDeadlineInfo(matchStart, false, new Date('2026-06-23T18:00:00.000Z'));
    const after = buildVetoDeadlineInfo(matchStart, false, new Date('2026-06-24T18:00:01.000Z'));
    assert.equal(before.deadlineExpired, false);
    assert.equal(after.deadlineExpired, true);
  });

  it('admin reopen ignora prazo expirado para novas ações', () => {
    const after = buildVetoDeadlineInfo(matchStart, true, new Date('2026-06-25T00:00:00.000Z'));
    assert.equal(after.deadlineExpired, false);
    assert.equal(isVetoActionAllowed(matchStart, true, 'BAN_PHASE', new Date('2026-06-25T00:00:00.000Z')), true);
  });
});
