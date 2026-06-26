export const VETO_DEADLINE_MS = 2 * 24 * 60 * 60 * 1000;

export type VetoDeadlineInfo = {
  scheduledAt: Date | null;
  vetoDeadlineAt: Date | null;
  deadlineExpired: boolean;
};

export function getVetoDeadlineAt(scheduledAt: Date | null | undefined, now = new Date()): Date | null {
  if (!scheduledAt) return null;
  const start = scheduledAt instanceof Date ? scheduledAt : new Date(scheduledAt);
  if (Number.isNaN(start.getTime())) return null;
  return new Date(start.getTime() - VETO_DEADLINE_MS);
}

export function buildVetoDeadlineInfo(
  scheduledAt: Date | null | undefined,
  vetoReopenedByAdmin: boolean,
  now = new Date()
): VetoDeadlineInfo {
  const resolved = scheduledAt instanceof Date ? scheduledAt : scheduledAt ? new Date(scheduledAt) : null;
  const scheduled = resolved && !Number.isNaN(resolved.getTime()) ? resolved : null;
  const vetoDeadlineAt = getVetoDeadlineAt(scheduled, now);
  const deadlineExpired =
    !vetoReopenedByAdmin && vetoDeadlineAt != null && now.getTime() >= vetoDeadlineAt.getTime();

  return {
    scheduledAt: scheduled,
    vetoDeadlineAt,
    deadlineExpired,
  };
}

export function isVetoActionAllowed(
  scheduledAt: Date | null | undefined,
  vetoReopenedByAdmin: boolean,
  status: string,
  now = new Date()
): boolean {
  if (status.toUpperCase() === 'COMPLETED') return false;
  const { deadlineExpired } = buildVetoDeadlineInfo(scheduledAt, vetoReopenedByAdmin, now);
  return !deadlineExpired;
}
