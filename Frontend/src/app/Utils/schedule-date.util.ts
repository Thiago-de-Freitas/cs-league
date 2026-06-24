const DEFAULT_SCHEDULE_TIMEZONE = 'America/Sao_Paulo';

export function toDateInputInTimezone(
  value: Date | string | null | undefined,
  timeZone = DEFAULT_SCHEDULE_TIMEZONE
): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
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
  return d.toLocaleString('pt-BR', {
    timeZone,
    weekday: 'short',
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

export function formatDateInTimezone(
  value: Date | string | null | undefined,
  timeZone = DEFAULT_SCHEDULE_TIMEZONE
): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('pt-BR', {
    timeZone,
    day: '2-digit',
    month: 'short',
  });
}
