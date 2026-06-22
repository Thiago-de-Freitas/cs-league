import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Match } from '../Models/interfaces';

@Injectable({ providedIn: 'root' })
export class MatchService {
  private apiUrl = '/api/matches';

  constructor(private http: HttpClient) {}

  getMatch(id: string): Observable<Match> {
    return this.http.get<Match>(`${this.apiUrl}/${id}`);
  }

  registerResult(matchId: string, winnerId: string, map?: string): Observable<Match & { groupPhaseJustCompleted?: boolean }> {
    return this.http.patch<Match & { groupPhaseJustCompleted?: boolean }>(`${this.apiUrl}/${matchId}/result`, { winnerId, map });
  }
}
