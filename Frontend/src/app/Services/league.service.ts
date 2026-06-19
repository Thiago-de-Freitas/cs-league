import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { League } from '../Models/interfaces';

@Injectable({ providedIn: 'root' })
export class LeagueService {
  private apiUrl = '/api/leagues';

  constructor(private http: HttpClient) {}

  getLeagues(includeArchived = false): Observable<League[]> {
    const params = includeArchived ? '?includeArchived=true' : '';
    return this.http.get<League[]>(`${this.apiUrl}${params}`);
  }

  getLeagueById(id: string): Observable<League> {
    return this.http.get<League>(`${this.apiUrl}/${id}`);
  }

  createLeague(data: {
    name: string;
    description?: string;
    maxTeams?: number;
    startDate?: string;
    endDate?: string;
    status?: string;
  }): Observable<League> {
    return this.http.post<League>(this.apiUrl, data);
  }

  updateLeague(id: string, data: Partial<League>): Observable<League> {
    return this.http.put<League>(`${this.apiUrl}/${id}`, data);
  }

  deleteLeague(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  archiveLeague(id: string): Observable<{ id: string; status: string; message: string }> {
    return this.http.post<{ id: string; status: string; message: string }>(`${this.apiUrl}/${id}/archive`, {});
  }

  addTeamsToLeague(leagueId: string, teamIds: string[]): Observable<League> {
    return this.http.post<League>(`${this.apiUrl}/${leagueId}/teams/bulk`, { teamIds });
  }

  addTeamToLeague(leagueId: string, teamId: string, seed?: number): Observable<League> {
    return this.http.post<League>(`${this.apiUrl}/${leagueId}/teams`, { teamId, seed });
  }

  removeTeamFromLeague(leagueId: string, teamId: string): Observable<League> {
    return this.http.delete<League>(`${this.apiUrl}/${leagueId}/teams/${teamId}`);
  }

  generateBracket(leagueId: string): Observable<League & { bracketInfo?: unknown }> {
    return this.http.post<League & { bracketInfo?: unknown }>(`${this.apiUrl}/${leagueId}/bracket/generate`, {});
  }

  getStandings(leagueId: string): Observable<unknown[]> {
    return this.http.get<unknown[]>(`${this.apiUrl}/${leagueId}/standings`);
  }

  updateTeamsOrder(leagueId: string, teams: { teamId: string; seed: number }[]): Observable<{ success: boolean }> {
    return this.http.put<{ success: boolean }>(`${this.apiUrl}/${leagueId}/teams/order`, { teams });
  }

  createMatch(leagueId: string, team1Id: string, team2Id: string, map?: string): Observable<unknown> {
    return this.http.post(`${this.apiUrl}/${leagueId}/matches`, { team1Id, team2Id, map });
  }
}
