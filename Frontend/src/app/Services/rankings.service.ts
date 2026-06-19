import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { PlayerRankingEntry, TeamRankingEntry } from '../Models/interfaces';

@Injectable({ providedIn: 'root' })
export class RankingsService {
  private apiUrl = '/api/rankings';

  constructor(private http: HttpClient) {}

  getPlayerRankings(): Observable<PlayerRankingEntry[]> {
    return this.http.get<PlayerRankingEntry[]>(`${this.apiUrl}/players`);
  }

  getTeamRankings(): Observable<TeamRankingEntry[]> {
    return this.http.get<TeamRankingEntry[]>(`${this.apiUrl}/teams`);
  }
}
