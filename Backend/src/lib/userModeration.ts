export type UserModerationRecord = {
  isActive: boolean;
  bannedUntil: Date | string | null;
};

export function isParticipationBanned(user: UserModerationRecord, now = new Date()): boolean {
  if (!user.bannedUntil) return false;
  const until = user.bannedUntil instanceof Date ? user.bannedUntil : new Date(user.bannedUntil);
  if (Number.isNaN(until.getTime())) return false;
  return until.getTime() > now.getTime();
}

export function canUserLogin(user: UserModerationRecord): boolean {
  return user.isActive !== false;
}

export function canUserParticipate(user: UserModerationRecord, now = new Date()): boolean {
  if (!canUserLogin(user)) return false;
  return !isParticipationBanned(user, now);
}

export function parseBanDays(value: unknown): number | null {
  const days = Number(value);
  if (!Number.isInteger(days) || days < 1 || days > 365) return null;
  return days;
}

export function computeBannedUntil(days: number, from = new Date()): Date {
  const until = new Date(from);
  until.setDate(until.getDate() + days);
  return until;
}

export const PARTICIPATION_BAN_MESSAGE =
  'Sua conta está suspensa de participar de ligas, partidas e envio de demos até a data indicada.';

export const DEACTIVATED_ACCOUNT_MESSAGE = 'Conta desativada. Entre em contato com o administrador.';
