/** Agendamento de partidas — fase de grupos (grupo único na fase 1) */

export const DEFAULT_MATCH_TIME = '20:00';
export const DEFAULT_SCHEDULE_TIMEZONE = 'America/Sao_Paulo';

export interface LeagueScheduleConfig {
  startDate: Date | null;
  defaultMatchDays: number[];
  defaultMatchTime: string;
  scheduleTimezone: string;
}

export interface WeekOverride {
  weekStart: Date;
  daysOfWeek: number[];
}

export interface MatchForScheduling {
  id: string;
  groupRound: number | null;
  status: string;
  winnerId?: string | null;
}

export interface ScheduledMatchUpdate {
  id: string;
  scheduledAt: Date;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Partes de data/hora no fuso informado */
export function getDatePartsInTimezone(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short',
  });
  const parts: Record<string, string> = {};
  for (const { type, value } of fmt.formatToParts(date)) {
    if (type !== 'literal') parts[type] = value;
  }
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  let hour = Number(parts.hour);
  let day = Number(parts.day);
  let month = Number(parts.month);
  let year = Number(parts.year);
  let weekday = weekdayMap[parts.weekday] ?? 0;

  // Alguns runtimes retornam 24:00 em vez de 00:00 do dia seguinte.
  if (hour === 24) {
    hour = 0;
    const next = addDaysInTimezone(year, month, day, 1, timeZone);
    year = next.year;
    month = next.month;
    day = next.day;
    weekday = (weekday + 1) % 7;
  }

  return {
    year,
    month,
    day,
    hour,
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday,
  };
}

/** Cria Date UTC a partir de componentes no fuso da liga */
export function makeDateInTimezone(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  const targetUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let guess = new Date(targetUtc);
  for (let i = 0; i < 4; i++) {
    const p = getDatePartsInTimezone(guess, timeZone);
    const shownUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const diff = targetUtc - shownUtc;
    if (diff === 0) break;
    guess = new Date(guess.getTime() + diff);
  }
  return guess;
}

export function parseMatchTime(value: string): { hour: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

export function parseDefaultMatchDays(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const days = value.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  if (days.length === 0) return null;
  return [...new Set(days)].sort((a, b) => a - b);
}

export function isValidMatchDays(days: number[]): boolean {
  return days.length > 0 && days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6);
}

export function weekStartKey(date: Date, timeZone: string): string {
  const monday = startOfWeekMonday(date, timeZone);
  const p = getDatePartsInTimezone(monday, timeZone);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/** Offset em dias a partir da segunda (0=Seg … 6=Dom) para convenção JS (0=Dom … 6=Sab). */
export function daysFromMondayForWeekday(dayOfWeek: number): number {
  return (dayOfWeek + 6) % 7;
}

/** Segunda-feira ao meio-dia no fuso da liga (âncora estável para cálculo de dias). */
export function startOfWeekMonday(date: Date, timeZone: string): Date {
  const p = getDatePartsInTimezone(date, timeZone);
  const daysFromMonday = daysFromMondayForWeekday(p.weekday);
  const mondayDay = p.day - daysFromMonday;
  return makeDateInTimezone(p.year, p.month, mondayDay, 12, 0, timeZone);
}

export function addDaysInTimezone(
  year: number,
  month: number,
  day: number,
  daysToAdd: number,
  timeZone: string
): { year: number; month: number; day: number } {
  const d = makeDateInTimezone(year, month, day, 12, 0, timeZone);
  const next = new Date(d.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
  const p = getDatePartsInTimezone(next, timeZone);
  return { year: p.year, month: p.month, day: p.day };
}

export function buildOverridesMap(overrides: WeekOverride[], timeZone: string): Map<string, number[]> {
  const map = new Map<string, number[]>();
  for (const o of overrides) {
    const key = weekStartKey(o.weekStart, timeZone);
    map.set(key, [...new Set(o.daysOfWeek)].sort((a, b) => a - b));
  }
  return map;
}

export function getEffectiveDaysForWeek(
  weekStart: Date,
  defaultDays: number[],
  overrides: Map<string, number[]>,
  timeZone: string
): number[] {
  const key = weekStartKey(weekStart, timeZone);
  return overrides.get(key) ?? defaultDays;
}

function sortedUniqueRounds(matches: MatchForScheduling[]): number[] {
  const rounds = new Set<number>();
  for (const m of matches) {
    if (m.groupRound != null) rounds.add(m.groupRound);
  }
  return [...rounds].sort((a, b) => a - b);
}

function isSchedulableMatch(m: MatchForScheduling): boolean {
  return m.status === 'SCHEDULED' && !m.winnerId;
}

/** Próximo slot >= cursor em dias permitidos a partir de weekStart */
function findNextSlot(
  cursor: Date,
  weekStart: Date,
  defaultDays: number[],
  overrides: Map<string, number[]>,
  timeZone: string,
  hour: number,
  minute: number
): { scheduledAt: Date; nextWeekStart: Date } {
  let currentWeekStart = weekStart;
  let safety = 0;

  while (safety < 104) {
    safety++;
    const days = getEffectiveDaysForWeek(currentWeekStart, defaultDays, overrides, timeZone);
    if (days.length === 0) {
      const wp = getDatePartsInTimezone(currentWeekStart, timeZone);
      const nextMonday = addDaysInTimezone(wp.year, wp.month, wp.day, 7, timeZone);
      currentWeekStart = makeDateInTimezone(nextMonday.year, nextMonday.month, nextMonday.day, 12, 0, timeZone);
      continue;
    }

    const cursorParts = getDatePartsInTimezone(cursor, timeZone);
    const weekParts = getDatePartsInTimezone(currentWeekStart, timeZone);

    for (const dayOfWeek of days) {
      const daysFromMonday = daysFromMondayForWeekday(dayOfWeek);
      const slotDate = addDaysInTimezone(weekParts.year, weekParts.month, weekParts.day, daysFromMonday, timeZone);
      const candidate = makeDateInTimezone(slotDate.year, slotDate.month, slotDate.day, hour, minute, timeZone);

      const candParts = getDatePartsInTimezone(candidate, timeZone);
      const cursorYmd =
        cursorParts.year * 10000 + cursorParts.month * 100 + cursorParts.day;
      const candYmd = candParts.year * 10000 + candParts.month * 100 + candParts.day;
      const cursorHm = cursorParts.hour * 60 + cursorParts.minute;
      const candHm = candParts.hour * 60 + candParts.minute;

      if (candYmd > cursorYmd || (candYmd === cursorYmd && candHm >= cursorHm)) {
        if (candidate >= cursor) {
          return { scheduledAt: candidate, nextWeekStart: currentWeekStart };
        }
      }
    }

    const wp = getDatePartsInTimezone(currentWeekStart, timeZone);
    const nextMonday = addDaysInTimezone(wp.year, wp.month, wp.day, 7, timeZone);
    currentWeekStart = makeDateInTimezone(nextMonday.year, nextMonday.month, nextMonday.day, 12, 0, timeZone);
  }

  throw new Error('SCHEDULE_SLOT_NOT_FOUND');
}

export function isValidScheduleTimezone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Interpreta data de início no calendário do fuso da liga (YYYY-MM-DD ou ISO). */
export function parseScheduleStartDate(value: unknown, timeZone: string): Date | null {
  if (value == null || value === '') return null;
  const tz = isValidScheduleTimezone(timeZone) ? timeZone : DEFAULT_SCHEDULE_TIMEZONE;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const p = getDatePartsInTimezone(value, tz);
    return makeDateInTimezone(p.year, p.month, p.day, 12, 0, tz);
  }

  const str = String(value).trim();
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
    return makeDateInTimezone(year, month, day, 12, 0, tz);
  }

  const parsed = new Date(str);
  if (Number.isNaN(parsed.getTime())) return null;
  const p = getDatePartsInTimezone(parsed, tz);
  return makeDateInTimezone(p.year, p.month, p.day, 12, 0, tz);
}

export function buildScheduledDates(
  matches: MatchForScheduling[],
  config: LeagueScheduleConfig,
  overrides: WeekOverride[] = []
): ScheduledMatchUpdate[] {
  if (!config.startDate) {
    throw new Error('START_DATE_REQUIRED');
  }
  if (!isValidMatchDays(config.defaultMatchDays)) {
    throw new Error('DEFAULT_MATCH_DAYS_REQUIRED');
  }

  const time = parseMatchTime(config.defaultMatchTime) ?? parseMatchTime(DEFAULT_MATCH_TIME)!;
  const tz = config.scheduleTimezone || DEFAULT_SCHEDULE_TIMEZONE;
  const overrideMap = buildOverridesMap(overrides, tz);

  const schedulable = matches.filter(isSchedulableMatch);
  const rounds = sortedUniqueRounds(schedulable);
  const updates: ScheduledMatchUpdate[] = [];

  let cursor = config.startDate;
  let weekStart = startOfWeekMonday(config.startDate, tz);

  for (const round of rounds) {
    const roundMatches = schedulable
      .filter((m) => m.groupRound === round)
      .sort((a, b) => a.id.localeCompare(b.id));

    for (const match of roundMatches) {
      const slot = findNextSlot(
        cursor,
        weekStart,
        config.defaultMatchDays,
        overrideMap,
        tz,
        time.hour,
        time.minute
      );
      updates.push({ id: match.id, scheduledAt: slot.scheduledAt });
      cursor = new Date(slot.scheduledAt.getTime() + 60_000);
      weekStart = slot.nextWeekStart;
    }

    const wp = getDatePartsInTimezone(weekStart, tz);
    const nextMonday = addDaysInTimezone(wp.year, wp.month, wp.day, 7, tz);
    weekStart = makeDateInTimezone(nextMonday.year, nextMonday.month, nextMonday.day, 12, 0, tz);
    const wsParts = getDatePartsInTimezone(weekStart, tz);
    cursor = makeDateInTimezone(wsParts.year, wsParts.month, wsParts.day, time.hour, time.minute, tz);
  }

  return updates;
}

export function recalculateLeagueEndDate(
  matches: { scheduledAt: Date | null; status: string }[]
): Date | null {
  let max: Date | null = null;
  for (const m of matches) {
    if (m.status === 'CANCELLED' || !m.scheduledAt) continue;
    if (!max || m.scheduledAt > max) max = m.scheduledAt;
  }
  return max;
}

export function isScheduleConfigured(config: LeagueScheduleConfig): boolean {
  return !!config.startDate && isValidMatchDays(config.defaultMatchDays);
}

export function parseWeekStartParam(value: string, timeZone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const date = makeDateInTimezone(year, month, day, 0, 0, timeZone);
  const monday = startOfWeekMonday(date, timeZone);
  const key = weekStartKey(monday, timeZone);
  const inputKey = weekStartKey(date, timeZone);
  if (key !== inputKey) return null;
  return monday;
}
