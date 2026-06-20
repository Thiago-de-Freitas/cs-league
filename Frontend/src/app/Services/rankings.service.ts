import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { PlayerRankingEntry, TeamRankingEntry, PlayerProfileStats } from '../Models/interfaces';

@Injectable({ providedIn: 'root' })
export class RankingsService {
  private apiUrl = '/api/rankings';

  constructor(private http: HttpClient) {}

  getPlayerRankings(leagueId?: string): Observable<PlayerRankingEntry[]> {
    const params = leagueId ? `?leagueId=${encodeURIComponent(leagueId)}` : '';
    return this.http.get<PlayerRankingEntry[]>(`${this.apiUrl}/players${params}`);
  }

  getPlayerProfile(steamId: string): Observable<PlayerProfileStats> {
    return this.http.get<PlayerProfileStats>(`${this.apiUrl}/players/${encodeURIComponent(steamId)}`);
  }

  getTeamRankings(): Observable<TeamRankingEntry[]> {
    return this.http.get<TeamRankingEntry[]>(`${this.apiUrl}/teams`);
  }
}
