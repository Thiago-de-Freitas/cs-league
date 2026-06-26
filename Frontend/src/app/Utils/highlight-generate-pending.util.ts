import { MatchHighlight } from '../Models/interfaces';

export const HIGHLIGHT_GENERATE_PENDING_KEY = 'cs-league:highlight-generate-pending';
export const HIGHLIGHT_GENERATE_TTL_MS = 15 * 60 * 1000;

export interface HighlightGeneratePending {
  demoId?: string;
  matchId?: string;
  startedAt: number;
  snapshotCount: number;
  snapshotIds: string[];
}

export function createHighlightSnapshot(highlights: MatchHighlight[]): {
  snapshotCount: number;
  snapshotIds: string[];
} {
  return {
    snapshotCount: highlights.length,
    snapshotIds: highlights.map((h) => h.id),
  };
}

export function readHighlightGeneratePending(): HighlightGeneratePending | null {
  try {
    const raw = sessionStorage.getItem(HIGHLIGHT_GENERATE_PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HighlightGeneratePending;
    if (!parsed?.startedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeHighlightGeneratePending(pending: HighlightGeneratePending): void {
  sessionStorage.setItem(HIGHLIGHT_GENERATE_PENDING_KEY, JSON.stringify(pending));
}

export function clearHighlightGeneratePending(): void {
  sessionStorage.removeItem(HIGHLIGHT_GENERATE_PENDING_KEY);
}

export function isHighlightGeneratePendingExpired(
  pending: HighlightGeneratePending,
  now = Date.now()
): boolean {
  return now - pending.startedAt > HIGHLIGHT_GENERATE_TTL_MS;
}

export function findHighlightGeneratePendingForDemo(
  demoId: string
): HighlightGeneratePending | null {
  const pending = readHighlightGeneratePending();
  if (!pending || pending.demoId !== demoId) return null;
  if (isHighlightGeneratePendingExpired(pending)) {
    clearHighlightGeneratePending();
    return null;
  }
  return pending;
}

export function findHighlightGeneratePendingForMatch(
  matchId: string
): HighlightGeneratePending | null {
  const pending = readHighlightGeneratePending();
  if (!pending || pending.matchId !== matchId) return null;
  if (isHighlightGeneratePendingExpired(pending)) {
    clearHighlightGeneratePending();
    return null;
  }
  return pending;
}

export function hasHighlightVideoRendering(highlights: MatchHighlight[]): boolean {
  return highlights.some(
    (h) => h.clipRenderStatus === 'PENDING' || h.clipRenderStatus === 'PROCESSING'
  );
}

export function isHighlightGenerationComplete(
  highlights: MatchHighlight[],
  pending: HighlightGeneratePending,
  now = Date.now()
): boolean {
  if (isHighlightGeneratePendingExpired(pending, now)) {
    return true;
  }

  if (hasHighlightVideoRendering(highlights)) {
    return false;
  }

  const currentIds = highlights.map((h) => h.id).sort().join(',');
  const snapshotIds = [...pending.snapshotIds].sort().join(',');
  const changed =
    highlights.length !== pending.snapshotCount || currentIds !== snapshotIds;

  if (changed && highlights.length > 0) {
    return true;
  }

  // Extração concluída sem destaques detectados.
  if (changed && highlights.length === 0 && now - pending.startedAt > 30_000) {
    return true;
  }

  return false;
}
