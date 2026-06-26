import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Match, ManualPlayerStatInput, MapVetoState, MatchLineupEntry, MatchImage, MatchSeriesInfo } from '../Models/interfaces';

@Injectable({ providedIn: 'root' })
export class MatchService {
  private apiUrl = '/api/matches';

  constructor(private http: HttpClient) {}

  getMatch(id: string): Observable<Match> {
    return this.http.get<Match>(`${this.apiUrl}/${id}`);
  }

  registerResult(
    matchId: string,
    team1Rounds: number,
    team2Rounds: number,
    map?: string
  ): Observable<Match & { groupPhaseJustCompleted?: boolean }> {
    return this.http.patch<Match & { groupPhaseJustCompleted?: boolean }>(`${this.apiUrl}/${matchId}/result`, {
      team1Rounds,
      team2Rounds,
      map,
    });
  }

  rescheduleMatch(matchId: string, scheduledAt: string): Observable<Match> {
    return this.http.patch<Match>(`${this.apiUrl}/${matchId}/schedule`, { scheduledAt });
  }

  saveManualStats(
    matchId: string,
    players: ManualPlayerStatInput[],
    totalRounds?: number | null
  ): Observable<Match> {
    return this.http.put<Match>(`${this.apiUrl}/${matchId}/manual-stats`, {
      players,
      totalRounds: totalRounds ?? undefined,
    });
  }

  getMapVeto(matchId: string): Observable<{
    enabled: boolean;
    veto: MapVetoState | null;
    canAct?: boolean;
    canAdminReopen?: boolean;
  }> {
    return this.http.get<{
      enabled: boolean;
      veto: MapVetoState | null;
      canAct?: boolean;
      canAdminReopen?: boolean;
    }>(`${this.apiUrl}/${matchId}/map-veto`);
  }

  reopenMapVeto(matchId: string): Observable<{ veto: MapVetoState }> {
    return this.http.post<{ veto: MapVetoState }>(`${this.apiUrl}/${matchId}/map-veto/reopen`, {});
  }

  banMap(matchId: string, map: string): Observable<{ veto: MapVetoState }> {
    return this.http.post<{ veto: MapVetoState }>(`${this.apiUrl}/${matchId}/map-veto/ban`, { map });
  }

  pickSide(matchId: string, side: 'CT' | 'T'): Observable<{ veto: MapVetoState }> {
    return this.http.post<{ veto: MapVetoState }>(`${this.apiUrl}/${matchId}/map-veto/side`, { side });
  }

  saveLineup(matchId: string, team1PlayerUserId: string, team2PlayerUserId: string): Observable<{ lineup: MatchLineupEntry[] }> {
    return this.http.put<{ lineup: MatchLineupEntry[] }>(`${this.apiUrl}/${matchId}/lineup`, {
      team1PlayerUserId,
      team2PlayerUserId,
    });
  }

  uploadMatchImage(matchId: string, file: File, caption?: string): Observable<MatchImage> {
    const form = new FormData();
    form.append('image', file);
    if (caption) form.append('caption', caption);
    return this.http.post<MatchImage>(`${this.apiUrl}/${matchId}/images`, form);
  }

  deleteMatchImage(matchId: string, imageId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${matchId}/images/${imageId}`);
  }

  getMatchSeries(matchId: string): Observable<MatchSeriesInfo> {
    return this.http.get<MatchSeriesInfo>(`${this.apiUrl}/${matchId}/series`);
  }

  seriesBanMap(seriesId: string, map: string): Observable<MatchSeriesInfo> {
    return this.http.post<MatchSeriesInfo>(`/api/series/${seriesId}/veto/ban`, { map });
  }

  seriesPickMap(seriesId: string, map: string): Observable<MatchSeriesInfo> {
    return this.http.post<MatchSeriesInfo>(`/api/series/${seriesId}/veto/pick`, { map });
  }

  reopenSeriesVeto(seriesId: string): Observable<MatchSeriesInfo> {
    return this.http.post<MatchSeriesInfo>(`/api/series/${seriesId}/veto/reopen`, {});
  }

  downloadHighlightClip(matchId: string, highlightId: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/${matchId}/highlights/${highlightId}/clip?format=vdm`, {
      responseType: 'blob',
      headers: { Accept: 'text/plain' },
    });
  }
}
