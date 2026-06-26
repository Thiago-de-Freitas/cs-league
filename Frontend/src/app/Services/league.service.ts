import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, shareReplay, tap } from 'rxjs';
import { League, LeagueScheduleConfig, LeagueScheduleWeekOverride, PickupLeagueState } from '../Models/interfaces';

@Injectable({ providedIn: 'root' })
export class LeagueService {
  private apiUrl = '/api/leagues';
  private leaguesCache = new Map<string, Observable<League[]>>();
  private openLeaguesCache: Observable<League[]> | null = null;

  constructor(private http: HttpClient) {}

  private leaguesCacheKey(includeArchived: boolean): string {
    return includeArchived ? 'archived' : 'active';
  }

  invalidateLeagues(): void {
    this.leaguesCache.clear();
    this.openLeaguesCache = null;
  }

  getLeagues(includeArchived = false): Observable<League[]> {
    const key = this.leaguesCacheKey(includeArchived);
    if (!this.leaguesCache.has(key)) {
      const params = includeArchived ? '?includeArchived=true' : '';
      const request$ = this.http.get<League[]>(`${this.apiUrl}${params}`).pipe(shareReplay(1));
      this.leaguesCache.set(key, request$);
    }
    return this.leaguesCache.get(key)!;
  }

  getOpenLeagues(): Observable<League[]> {
    if (!this.openLeaguesCache) {
      this.openLeaguesCache = this.http.get<League[]>(`${this.apiUrl}/open`).pipe(shareReplay(1));
    }
    return this.openLeaguesCache;
  }

  getLeagueById(id: string): Observable<League> {
    return this.http.get<League>(`${this.apiUrl}/${id}`);
  }

  private afterLeagueMutation<T>(): (source: Observable<T>) => Observable<T> {
    return (source) => source.pipe(tap(() => this.invalidateLeagues()));
  }

  setupOneVsOne(
    leagueId: string,
    data: {
      team1Id: string;
      team2Id: string;
      team1PlayerUserId: string;
      team2PlayerUserId: string;
      scheduledAt?: string;
    }
  ): Observable<{ matchId: string; seriesId?: string; matchIds?: string[]; seriesFormat?: string }> {
    return this.http
      .post<{ matchId: string }>(`${this.apiUrl}/${leagueId}/one-vs-one/setup`, data)
      .pipe(this.afterLeagueMutation());
  }

  createLeague(data: {
    name: string;
    description?: string;
    maxTeams?: number | null;
    startDate?: string;
    endDate?: string;
    status?: string;
    registrationOpen?: boolean;
    format?: string;
    groupCount?: number;
    advancePerGroup?: number;
    homeAndAway?: boolean;
    matchesPerMatchDay?: number;
    mapPool?: string[];
    seriesFormat?: string;
    mapVetoEnabled?: boolean;
    pickupTeamCount?: number;
    pickupPlayersPerTeam?: number;
    pickupBalanceMode?: string;
  }): Observable<League> {
    return this.http.post<League>(this.apiUrl, data).pipe(this.afterLeagueMutation());
  }

  updateLeague(id: string, data: Partial<League> & {
    maxTeams?: number | null;
    groupCount?: number;
    advancePerGroup?: number;
    homeAndAway?: boolean;
    matchesPerMatchDay?: number;
    mapPool?: string[];
    seriesFormat?: string;
    mapVetoEnabled?: boolean;
  }): Observable<League> {
    return this.http.put<League>(`${this.apiUrl}/${id}`, data).pipe(this.afterLeagueMutation());
  }

  deleteLeague(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`).pipe(this.afterLeagueMutation());
  }

  archiveLeague(id: string): Observable<{ id: string; status: string; message: string }> {
    return this.http.post<{ id: string; status: string; message: string }>(`${this.apiUrl}/${id}/archive`, {}).pipe(
      this.afterLeagueMutation()
    );
  }

  unarchiveLeague(id: string): Observable<{ id: string; status: string; message: string }> {
    return this.http.post<{ id: string; status: string; message: string }>(`${this.apiUrl}/${id}/unarchive`, {}).pipe(
      this.afterLeagueMutation()
    );
  }

  addTeamsToLeague(leagueId: string, teamIds: string[]): Observable<League> {
    return this.http.post<League>(`${this.apiUrl}/${leagueId}/teams/bulk`, { teamIds }).pipe(this.afterLeagueMutation());
  }

  getAvailableTeams(leagueId: string): Observable<{ id: string; name: string; tag: string }[]> {
    return this.http.get<{ id: string; name: string; tag: string }[]>(`${this.apiUrl}/${leagueId}/available-teams`);
  }

  addTeamToLeague(leagueId: string, teamId: string, seed?: number): Observable<League> {
    return this.http.post<League>(`${this.apiUrl}/${leagueId}/teams`, { teamId, seed }).pipe(this.afterLeagueMutation());
  }

  registerTeamInLeague(leagueId: string, teamId: string): Observable<League> {
    return this.http.post<League>(`${this.apiUrl}/${leagueId}/register`, { teamId }).pipe(this.afterLeagueMutation());
  }

  removeTeamFromLeague(leagueId: string, teamId: string): Observable<League> {
    return this.http.delete<League>(`${this.apiUrl}/${leagueId}/teams/${teamId}`).pipe(this.afterLeagueMutation());
  }

  generateBracket(leagueId: string): Observable<League & { bracketInfo?: unknown }> {
    return this.http.post<League & { bracketInfo?: unknown }>(`${this.apiUrl}/${leagueId}/bracket/generate`, {}).pipe(
      this.afterLeagueMutation()
    );
  }

  generateGroups(leagueId: string): Observable<League & { groupInfo?: unknown }> {
    return this.http.post<League & { groupInfo?: unknown }>(`${this.apiUrl}/${leagueId}/groups/generate`, {}).pipe(
      this.afterLeagueMutation()
    );
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

  getSchedule(leagueId: string): Observable<LeagueScheduleConfig> {
    return this.http.get<LeagueScheduleConfig>(`${this.apiUrl}/${leagueId}/schedule`);
  }

  updateSchedule(
    leagueId: string,
    data: Partial<{
      startDate: string | null;
      defaultMatchDays: number[];
      defaultMatchTime: string;
      scheduleTimezone: string;
    }>
  ): Observable<LeagueScheduleConfig> {
    return this.http.put<LeagueScheduleConfig>(`${this.apiUrl}/${leagueId}/schedule`, data);
  }

  upsertWeekOverride(
    leagueId: string,
    weekStart: string,
    daysOfWeek: number[]
  ): Observable<LeagueScheduleWeekOverride> {
    return this.http.put<LeagueScheduleWeekOverride>(
      `${this.apiUrl}/${leagueId}/schedule/weeks/${weekStart}`,
      { daysOfWeek }
    );
  }

  deleteWeekOverride(leagueId: string, weekStart: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${leagueId}/schedule/weeks/${weekStart}`);
  }

  regenerateSchedule(leagueId: string): Observable<{ updatedCount: number; league: League }> {
    return this.http.post<{ updatedCount: number; league: League }>(
      `${this.apiUrl}/${leagueId}/schedule/regenerate`,
      {}
    );
  }

  getPickupState(leagueId: string): Observable<PickupLeagueState> {
    return this.http.get<PickupLeagueState>(`${this.apiUrl}/${leagueId}/pickup`);
  }

  addPickupPlayer(leagueId: string, userId: string): Observable<PickupLeagueState> {
    return this.http
      .post<PickupLeagueState>(`${this.apiUrl}/${leagueId}/pickup/players`, { userId })
      .pipe(this.afterLeagueMutation());
  }

  removePickupPlayer(leagueId: string, userId: string): Observable<PickupLeagueState> {
    return this.http
      .delete<PickupLeagueState>(`${this.apiUrl}/${leagueId}/pickup/players/${userId}`)
      .pipe(this.afterLeagueMutation());
  }

  assignPickupPlayer(leagueId: string, userId: string, teamId: string | null): Observable<PickupLeagueState> {
    return this.http
      .patch<PickupLeagueState>(`${this.apiUrl}/${leagueId}/pickup/assign`, { userId, teamId })
      .pipe(this.afterLeagueMutation());
  }

  balancePickupLeague(
    leagueId: string,
    data: { teamCount: number; playersPerTeam: number; balanceMode: string }
  ): Observable<PickupLeagueState> {
    return this.http
      .post<PickupLeagueState>(`${this.apiUrl}/${leagueId}/pickup/balance`, data)
      .pipe(this.afterLeagueMutation());
  }

  updatePickupSettings(
    leagueId: string,
    data: { teamCount?: number; playersPerTeam?: number; balanceMode?: string }
  ): Observable<PickupLeagueState> {
    return this.http.patch<PickupLeagueState>(`${this.apiUrl}/${leagueId}/pickup/settings`, data);
  }
}
