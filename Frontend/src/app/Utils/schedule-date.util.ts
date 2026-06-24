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
