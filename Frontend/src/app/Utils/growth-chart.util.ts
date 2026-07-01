export type GrowthChartCoord = { x: number; y: number };

export const GROWTH_CHART_VIEW = {
  width: 100,
  height: 50,
  padX: 4,
  padY: 5,
} as const;

export function mapValueToChartY(
  value: number,
  min: number,
  max: number,
  view: Pick<typeof GROWTH_CHART_VIEW, 'height' | 'padY'> = GROWTH_CHART_VIEW
): number {
  const innerH = view.height - view.padY * 2;
  const span = max - min || 1;
  const clamped = Math.max(min, Math.min(max, value));
  return view.padY + innerH - ((clamped - min) / span) * innerH;
}

export function buildSmoothLinePath(points: GrowthChartCoord[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) {
    return `M ${points[0].x},${points[0].y}`;
  }
  if (points.length === 2) {
    return `M ${points[0].x},${points[0].y} L ${points[1].x},${points[1].y}`;
  }

  let path = `M ${points[0].x},${points[0].y}`;

  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[index - 1] ?? points[index];
    const current = points[index];
    const next = points[index + 1];
    const after = points[index + 2] ?? next;

    const cp1x = current.x + (next.x - previous.x) / 6;
    const cp1y = current.y + (next.y - previous.y) / 6;
    const cp2x = next.x - (after.x - current.x) / 6;
    const cp2y = next.y - (after.y - current.y) / 6;

    path += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${next.x},${next.y}`;
  }

  return path;
}

export function buildSmoothAreaPath(
  points: GrowthChartCoord[],
  bottomY: number = GROWTH_CHART_VIEW.height
): string {
  if (points.length < 2) return '';

  const line = buildSmoothLinePath(points);
  const first = points[0];
  const last = points[points.length - 1];

  return `${line} L ${last.x},${bottomY} L ${first.x},${bottomY} Z`;
}
