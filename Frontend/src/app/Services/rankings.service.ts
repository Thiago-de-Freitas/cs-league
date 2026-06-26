import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, shareReplay } from 'rxjs';
import { PlayerRankingEntry, TeamRankingEntry, PlayerProfileStats } from '../Models/interfaces';
import { RankingPositionFilter } from '../Utils/player-positions';

export const PLAYER_RANKING_PAGE_SIZE_OPTIONS = [10, 20, 30] as const;
export type PlayerRankingPageSize = (typeof PLAYER_RANKING_PAGE_SIZE_OPTIONS)[number];

export type PlayerRankingQuery = {
  leagueId?: string;
  position?: RankingPositionFilter;
  page?: number;
  pageSize?: PlayerRankingPageSize;
};

export type PlayerRankingsPage = {
  players: PlayerRankingEntry[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

@Injectable({ providedIn: 'root' })
export class RankingsService {
  private apiUrl = '/api/rankings';
  private playerCache = new Map<string, Observable<PlayerRankingsPage>>();
  private teamRankingsCache: Observable<TeamRankingEntry[]> | null = null;

  constructor(private http: HttpClient) {}

  invalidateAll(): void {
    this.playerCache.clear();
    this.teamRankingsCache = null;
  }

  private playerCacheKey(query: PlayerRankingQuery = {}): string {
    return `${query.leagueId || ''}|${query.position || ''}|${query.page ?? 1}|${query.pageSize ?? 10}`;
  }

  private buildPlayerRankingsParams(query: PlayerRankingQuery = {}): string {
    const params = new URLSearchParams();
    params.set('page', String(query.page ?? 1));
    params.set('limit', String(query.pageSize ?? 10));
    if (query.leagueId) params.set('leagueId', query.leagueId);
    if (query.position) params.set('position', query.position);
    return `?${params.toString()}`;
  }

  getPlayerRankings(query: PlayerRankingQuery | string = {}): Observable<PlayerRankingsPage> {
    const normalized: PlayerRankingQuery = typeof query === 'string' ? { leagueId: query } : query;
    const key = this.playerCacheKey(normalized);
    if (!this.playerCache.has(key)) {
      const request$ = this.http
        .get<PlayerRankingsPage>(`${this.apiUrl}/players${this.buildPlayerRankingsParams(normalized)}`)
        .pipe(shareReplay(1));
      this.playerCache.set(key, request$);
    }
    return this.playerCache.get(key)!;
  }

  getPlayerProfile(steamId: string): Observable<PlayerProfileStats> {
    return this.http.get<PlayerProfileStats>(`${this.apiUrl}/players/${encodeURIComponent(steamId)}`);
  }

  getTeamRankings(): Observable<TeamRankingEntry[]> {
    if (!this.teamRankingsCache) {
      this.teamRankingsCache = this.http.get<TeamRankingEntry[]>(`${this.apiUrl}/teams`).pipe(shareReplay(1));
    }
    return this.teamRankingsCache;
  }
}
