const DEFAULT_SCHEDULE_TIMEZONE = 'America/Sao_Paulo';

function resolveTimeZone(timeZone?: string): string {
  const tz = (timeZone || DEFAULT_SCHEDULE_TIMEZONE).trim();
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_SCHEDULE_TIMEZONE;
  }
}

export function toDateInputInTimezone(
  value: Date | string | null | undefined,
  timeZone = DEFAULT_SCHEDULE_TIMEZONE
): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: resolveTimeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function formatScheduledAtInTimezone(
  value: Date | string | null | undefined,
  timeZone = DEFAULT_SCHEDULE_TIMEZONE
): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: resolveTimeZone(timeZone),
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function formatDateInTimezone(
  value: Date | string | null | undefined,
  timeZone = DEFAULT_SCHEDULE_TIMEZONE
): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: resolveTimeZone(timeZone),
    day: '2-digit',
    month: 'short',
  }).format(d);
}

function parseYmd(dateInput: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateInput.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isInteger(year) || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function toYmd(year: number, month: number, day: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}`;
}

function addDaysToYmd(year: number, month: number, day: number, daysToAdd: number): {
  year: number;
  month: number;
  day: number;
} {
  const d = new Date(Date.UTC(year, month - 1, day + daysToAdd, 12, 0, 0));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

function weekdayInTimezone(year: number, month: number, day: number, timeZone: string): number {
  const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const name = new Intl.DateTimeFormat('en-US', {
    timeZone: resolveTimeZone(timeZone),
    weekday: 'short',
  }).format(d);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[name] ?? 0;
}

/** Segunda-feira (YYYY-MM-DD) da semana que contém a data civil informada. */
export function mondayOfWeekContaining(
  dateInput: string,
  timeZone = DEFAULT_SCHEDULE_TIMEZONE
): string | null {
  const parsed = parseYmd(dateInput);
  if (!parsed) return null;
  const tz = resolveTimeZone(timeZone);
  const daysFromMonday = (weekdayInTimezone(parsed.year, parsed.month, parsed.day, tz) + 6) % 7;
  const monday = addDaysToYmd(parsed.year, parsed.month, parsed.day, -daysFromMonday);
  return toYmd(monday.year, monday.month, monday.day);
}

export function addWeeksToMonday(
  mondayInput: string,
  weeks: number,
  timeZone = DEFAULT_SCHEDULE_TIMEZONE
): string | null {
  const parsed = parseYmd(mondayInput);
  if (!parsed) return null;
  void timeZone;
  const shifted = addDaysToYmd(parsed.year, parsed.month, parsed.day, weeks * 7);
  return toYmd(shifted.year, shifted.month, shifted.day);
}

export function todayDateInputInTimezone(timeZone = DEFAULT_SCHEDULE_TIMEZONE): string {
  return toDateInputInTimezone(new Date(), timeZone);
}

export function currentWeekMonday(timeZone = DEFAULT_SCHEDULE_TIMEZONE): string {
  return mondayOfWeekContaining(todayDateInputInTimezone(timeZone), timeZone) ?? '';
}

export function formatWeekRange(
  mondayInput: string,
  timeZone = DEFAULT_SCHEDULE_TIMEZONE
): string | null {
  const mondayStr = mondayOfWeekContaining(mondayInput, timeZone);
  if (!mondayStr) return null;
  const monday = parseYmd(mondayStr);
  if (!monday) return null;
  const sunday = addDaysToYmd(monday.year, monday.month, monday.day, 6);
  const tz = resolveTimeZone(timeZone);
  const mondayDate = new Date(Date.UTC(monday.year, monday.month - 1, monday.day, 12, 0, 0));
  const sundayDate = new Date(Date.UTC(sunday.year, sunday.month - 1, sunday.day, 12, 0, 0));
  const dayMonth = new Intl.DateTimeFormat('pt-BR', {
    timeZone: tz,
    day: '2-digit',
    month: 'short',
  });
  const yearLabel = new Intl.DateTimeFormat('pt-BR', {
    timeZone: tz,
    year: 'numeric',
  }).format(sundayDate);
  return `${dayMonth.format(mondayDate)} – ${dayMonth.format(sundayDate)} ${yearLabel}`;
}

export interface WeekDayPreview {
  label: string;
  day: string;
  dateInput: string;
  isToday: boolean;
}

export function buildWeekDayPreviews(
  mondayInput: string,
  timeZone = DEFAULT_SCHEDULE_TIMEZONE
): WeekDayPreview[] {
  const mondayStr = mondayOfWeekContaining(mondayInput, timeZone);
  if (!mondayStr) return [];
  const monday = parseYmd(mondayStr);
  if (!monday) return [];
  const labels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  const today = todayDateInputInTimezone(timeZone);
  return labels.map((label, index) => {
    const civil = addDaysToYmd(monday.year, monday.month, monday.day, index);
    const dateInput = toYmd(civil.year, civil.month, civil.day);
    return {
      label,
      day: String(civil.day).padStart(2, '0'),
      dateInput,
      isToday: dateInput === today,
    };
  });
}
