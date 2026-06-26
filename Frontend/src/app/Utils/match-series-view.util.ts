export function isBo3Match(input: {
  leagueSeriesFormat?: string | null;
  seriesFormat?: string | null;
}): boolean {
  return input.seriesFormat === 'bo3' || input.leagueSeriesFormat === 'bo3';
}

export function showSeriesVetoPanel(series: {
  format?: string;
  vetoStatus?: string;
} | null | undefined): boolean {
  if (!series) return false;
  return (
    series.format === 'bo3'
    && (series.vetoStatus === 'ban_phase' || series.vetoStatus === 'pick_phase')
  );
}

export function showMatchMapVeto(input: {
  mapVetoEnabled?: boolean;
  isBo3: boolean;
  seriesVetoStatus?: string | null;
  hasMapVeto?: boolean;
}): boolean {
  if (!input.mapVetoEnabled) return false;
  if (input.isBo3) {
    const status = input.seriesVetoStatus;
    if (status === 'ban_phase' || status === 'pick_phase') return false;
    return !!input.hasMapVeto;
  }
  return true;
}

export function formatSeriesMapWins(team1MapWins?: number | null, team2MapWins?: number | null): string {
  if (team1MapWins == null || team2MapWins == null) return '';
  return `${team1MapWins} – ${team2MapWins}`;
}
