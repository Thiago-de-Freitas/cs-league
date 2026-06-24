import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildScheduledDates,
  getDatePartsInTimezone,
  getEffectiveDaysForWeek,
  makeDateInTimezone,
  recalculateLeagueEndDate,
  startOfWeekMonday,
  weekStartKey,
  DEFAULT_SCHEDULE_TIMEZONE,
} from './matchSchedule';

const TZ = DEFAULT_SCHEDULE_TIMEZONE;

function makeStartDate(year: number, month: number, day: number): Date {
  return makeDateInTimezone(year, month, day, 0, 0, TZ);
}

function addWeeksMonday(weekStart: Date, weeks: number): Date {
  const p = getDatePartsInTimezone(weekStart, TZ);
  const next = makeDateInTimezone(p.year, p.month, p.day + weeks * 7, 12, 0, TZ);
  return startOfWeekMonday(next, TZ);
}

describe('matchSchedule', () => {
  it('startOfWeekMonday returns Monday for a Wednesday', () => {
    const wed = makeStartDate(2026, 6, 17);
    const monday = startOfWeekMonday(wed, TZ);
    const p = getDatePartsInTimezone(monday, TZ);
    assert.equal(p.weekday, 1);
    assert.equal(p.day, 15);
  });

  it('getEffectiveDaysForWeek uses override when present', () => {
    const weekStart = makeStartDate(2026, 6, 16);
    const days = getEffectiveDaysForWeek(weekStart, [1, 3], [{ weekStart, daysOfWeek: [2, 4] }], TZ);
    assert.deepEqual(days, [2, 4]);
  });

  it('getEffectiveDaysForWeek applies custom override from week forward', () => {
    const week1 = makeStartDate(2026, 6, 15);
    const week2 = addWeeksMonday(week1, 1);
    const overrides = [{ weekStart: week1, daysOfWeek: [5] }];

    assert.deepEqual(getEffectiveDaysForWeek(week1, [1, 3], overrides, TZ), [5]);
    assert.deepEqual(getEffectiveDaysForWeek(week2, [1, 3], overrides, TZ), [5]);
  });

  it('blocked override affects only the exact week', () => {
    const week1 = makeStartDate(2026, 6, 15);
    const week2 = addWeeksMonday(week1, 1);
    const overrides = [{ weekStart: week1, daysOfWeek: [] }];

    assert.deepEqual(getEffectiveDaysForWeek(week1, [1, 3], overrides, TZ), []);
    assert.deepEqual(getEffectiveDaysForWeek(week2, [1, 3], overrides, TZ), [1, 3]);
  });

  it('distributes 4-team round-robin on Mon+Wed across weeks', () => {
    const startDate = makeStartDate(2026, 6, 15);
    const matches = [
      { id: 'm1', groupRound: 1, status: 'SCHEDULED' },
      { id: 'm2', groupRound: 1, status: 'SCHEDULED' },
      { id: 'm3', groupRound: 2, status: 'SCHEDULED' },
      { id: 'm4', groupRound: 2, status: 'SCHEDULED' },
      { id: 'm5', groupRound: 3, status: 'SCHEDULED' },
      { id: 'm6', groupRound: 3, status: 'SCHEDULED' },
    ];

    const updates = buildScheduledDates(
      matches,
      {
        startDate,
        defaultMatchDays: [1, 3],
        defaultMatchTime: '20:00',
        scheduleTimezone: TZ,
      },
      []
    );

    assert.equal(updates.length, 6);

    const byId = Object.fromEntries(updates.map((u) => [u.id, u.scheduledAt]));
    const p1 = getDatePartsInTimezone(byId.m1, TZ);
    const p2 = getDatePartsInTimezone(byId.m2, TZ);
    const p3 = getDatePartsInTimezone(byId.m3, TZ);

    assert.equal(p1.weekday, 1);
    assert.equal(p2.weekday, 3);
    assert.equal(p1.day, 15);
    assert.equal(p2.day, 17);

    assert.equal(p3.weekday, 1);
    assert.equal(p3.day, 22);
  });

  it('override changes days from that week forward', () => {
    const startDate = makeStartDate(2026, 6, 15);
    const weekStart = startOfWeekMonday(startDate, TZ);
    const matches = [
      { id: 'm1', groupRound: 1, status: 'SCHEDULED' },
      { id: 'm2', groupRound: 1, status: 'SCHEDULED' },
    ];

    const updates = buildScheduledDates(
      matches,
      {
        startDate,
        defaultMatchDays: [1, 3],
        defaultMatchTime: '20:00',
        scheduleTimezone: TZ,
      },
      [{ weekStart, daysOfWeek: [5] }]
    );

    const p1 = getDatePartsInTimezone(updates[0].scheduledAt, TZ);
    const p2 = getDatePartsInTimezone(updates[1].scheduledAt, TZ);
    assert.equal(p1.weekday, 5);
    assert.equal(p1.day, 19);
    assert.equal(p2.weekday, 5);
    assert.equal(p2.day, 26);
  });

  it('blocked week skips scheduling and moves matches forward', () => {
    const startDate = makeStartDate(2026, 6, 15);
    const weekStart = startOfWeekMonday(startDate, TZ);
    const matches = [
      { id: 'm1', groupRound: 1, status: 'SCHEDULED' },
      { id: 'm2', groupRound: 1, status: 'SCHEDULED' },
    ];

    const updates = buildScheduledDates(
      matches,
      {
        startDate,
        defaultMatchDays: [1, 3],
        defaultMatchTime: '20:00',
        scheduleTimezone: TZ,
      },
      [{ weekStart, daysOfWeek: [] }]
    );

    const p1 = getDatePartsInTimezone(updates[0].scheduledAt, TZ);
    const p2 = getDatePartsInTimezone(updates[1].scheduledAt, TZ);
    assert.equal(p1.weekday, 1);
    assert.equal(p1.day, 22);
    assert.equal(p2.weekday, 3);
    assert.equal(p2.day, 24);
  });

  it('recalculateLeagueEndDate returns max scheduledAt ignoring cancelled', () => {
    const d1 = new Date('2026-06-16T23:00:00.000Z');
    const d2 = new Date('2026-06-20T23:00:00.000Z');
    const end = recalculateLeagueEndDate([
      { scheduledAt: d1, status: 'SCHEDULED' },
      { scheduledAt: d2, status: 'SCHEDULED' },
      { scheduledAt: new Date('2026-07-01T23:00:00.000Z'), status: 'CANCELLED' },
    ]);
    assert.equal(end?.getTime(), d2.getTime());
  });

  it('weekStartKey is stable for same Monday', () => {
    const monday = makeStartDate(2026, 6, 15);
    assert.equal(weekStartKey(monday, TZ), '2026-06-15');
  });

  it('limits matches per calendar day when matchesPerMatchDay is set', () => {
    const startDate = makeStartDate(2026, 6, 15);
    const matches = [
      { id: 'm1', groupRound: 1, status: 'SCHEDULED' },
      { id: 'm2', groupRound: 1, status: 'SCHEDULED' },
      { id: 'm3', groupRound: 1, status: 'SCHEDULED' },
      { id: 'm4', groupRound: 2, status: 'SCHEDULED' },
    ];

    const updates = buildScheduledDates(
      matches,
      {
        startDate,
        defaultMatchDays: [5],
        defaultMatchTime: '15:00',
        scheduleTimezone: TZ,
        matchesPerMatchDay: 2,
      },
      []
    );

    assert.equal(updates.length, 4);
    const byId = Object.fromEntries(updates.map((u) => [u.id, u.scheduledAt]));
    const p1 = getDatePartsInTimezone(byId.m1, TZ);
    const p2 = getDatePartsInTimezone(byId.m2, TZ);
    const p3 = getDatePartsInTimezone(byId.m3, TZ);
    const p4 = getDatePartsInTimezone(byId.m4, TZ);

    assert.equal(p1.weekday, 5);
    assert.equal(p2.weekday, 5);
    assert.equal(p1.day, p2.day);
    assert.equal(p3.weekday, 5);
    assert.notEqual(p3.day, p1.day);
    assert.equal(p4.weekday, 5);
    assert.equal(p4.day, p3.day);
  });
});
