import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildScheduledDates,
  getDatePartsInTimezone,
  makeDateInTimezone,
  parseScheduleStartDate,
  startOfWeekMonday,
  DEFAULT_SCHEDULE_TIMEZONE,
} from './matchSchedule';

const TZ = DEFAULT_SCHEDULE_TIMEZONE;
const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

describe('Friday 15:00 scheduling', () => {
  it('agenda confrontos de sexta às 15:00 no fuso da liga (7 times, grupo único)', () => {
    const startDate = makeDateInTimezone(2026, 6, 15, 12, 0, TZ);
    const matches = [];
    for (let r = 1; r <= 7; r++) {
      for (let i = 0; i < 3; i++) {
        matches.push({ id: `r${r}m${i}`, groupRound: r, status: 'SCHEDULED' });
      }
    }

    const updates = buildScheduledDates(
      matches,
      {
        startDate,
        defaultMatchDays: [5],
        defaultMatchTime: '15:00',
        scheduleTimezone: TZ,
      },
      []
    );

    assert.equal(updates.length, 21);

    for (const update of updates) {
      const p = getDatePartsInTimezone(update.scheduledAt, TZ);
      assert.equal(
        p.weekday,
        5,
        `esperado Sex, obteve ${DAY_NAMES[p.weekday]} em ${p.day}/${p.month} ${p.hour}:${p.minute}`
      );
      assert.equal(p.hour, 15);
      assert.equal(p.minute, 0);
    }
  });

  it('startOfWeekMonday + offset de sexta cai na sexta correta', () => {
    const startDate = makeDateInTimezone(2026, 6, 15, 0, 0, TZ);
    const monday = startOfWeekMonday(startDate, TZ);
    const mondayParts = getDatePartsInTimezone(monday, TZ);
    assert.equal(mondayParts.weekday, 1);

    const friday = makeDateInTimezone(2026, 6, 19, 15, 0, TZ);
    const fridayParts = getDatePartsInTimezone(friday, TZ);
    assert.equal(fridayParts.weekday, 5);
    assert.equal(fridayParts.hour, 15);
  });

  it('parseScheduleStartDate (YYYY-MM-DD) e ISO do frontend geram sexta 15:00', () => {
    const fromDateOnly = parseScheduleStartDate('2026-06-15', TZ);
    assert.ok(fromDateOnly);

    const fromBrowserIso = parseScheduleStartDate(
      new Date('2026-06-15T12:00:00').toISOString(),
      TZ
    );
    assert.ok(fromBrowserIso);

    const matches = [{ id: 'm1', groupRound: 1, status: 'SCHEDULED' }];

    for (const startDate of [fromDateOnly!, fromBrowserIso!]) {
      const updates = buildScheduledDates(
        matches,
        {
          startDate,
          defaultMatchDays: [5],
          defaultMatchTime: '15:00',
          scheduleTimezone: TZ,
        },
        []
      );
      const p = getDatePartsInTimezone(updates[0].scheduledAt, TZ);
      assert.equal(p.weekday, 5, `startDate ${startDate.toISOString()} deveria cair numa sexta`);
      assert.equal(p.hour, 15);
    }
  });
});
