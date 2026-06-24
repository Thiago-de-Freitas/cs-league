export interface WeekOverrideLike {
  weekStart: string;
  daysOfWeek: number[];
}

export function isWeekOverrideBlocked(daysOfWeek: number[]): boolean {
  return daysOfWeek.length === 0;
}

function sortOverrides(overrides: WeekOverrideLike[]): WeekOverrideLike[] {
  return [...overrides].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

export function getEffectiveDaysForWeekKey(
  weekMonday: string,
  defaultDays: number[],
  overrides: WeekOverrideLike[]
): number[] {
  for (const override of sortOverrides(overrides)) {
    if (override.weekStart === weekMonday && isWeekOverrideBlocked(override.daysOfWeek)) {
      return [];
    }
  }

  let effective = defaultDays;
  for (const override of sortOverrides(overrides)) {
    if (isWeekOverrideBlocked(override.daysOfWeek)) continue;
    if (override.weekStart <= weekMonday) {
      effective = [...new Set(override.daysOfWeek)].sort((a, b) => a - b);
    }
  }

  return effective;
}

export function hasExactWeekOverride(weekMonday: string, overrides: WeekOverrideLike[]): boolean {
  return overrides.some((override) => override.weekStart === weekMonday);
}

export function isWeekAffectedByOverrides(
  weekMonday: string,
  defaultDays: number[],
  overrides: WeekOverrideLike[]
): boolean {
  if (hasExactWeekOverride(weekMonday, overrides)) return true;
  const effective = getEffectiveDaysForWeekKey(weekMonday, defaultDays, overrides);
  const normalizedDefault = [...new Set(defaultDays)].sort((a, b) => a - b).join(',');
  const normalizedEffective = [...new Set(effective)].sort((a, b) => a - b).join(',');
  return normalizedDefault !== normalizedEffective;
}

export function findOverrideStartingAt(weekMonday: string, overrides: WeekOverrideLike[]): WeekOverrideLike | undefined {
  return overrides.find((override) => override.weekStart === weekMonday);
}

export function findActiveForwardOverride(weekMonday: string, overrides: WeekOverrideLike[]): WeekOverrideLike | undefined {
  let active: WeekOverrideLike | undefined;
  for (const override of sortOverrides(overrides)) {
    if (isWeekOverrideBlocked(override.daysOfWeek)) continue;
    if (override.weekStart <= weekMonday) {
      active = override;
    }
  }
  return active;
}
