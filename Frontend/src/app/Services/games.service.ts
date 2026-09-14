import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, shareReplay } from 'rxjs';

export type GameId = 'cs2' | 'valorant' | 'lol' | 'pubg';

export interface GameMapOption {
  id: string;
  label: string;
}

export interface GameConfigApi {
  id: string;
  label: string;
  shortLabel: string;
  tagline: string;
  defaultTeamSize: number;
  minPickupPlayersPerTeam: number;
  maxPickupPlayersPerTeam: number;
  seriesFormats: string[];
  allowedLeagueFormats: string[];
  scoringMode: 'ROUNDS' | 'GAMES_WON' | 'PLACEMENT_POINTS';
  statsIngestion: 'DEMO_UPLOAD' | 'RIOT_API' | 'PUBG_API' | 'MANUAL_ONLY';
  supportsMapVeto: boolean;
  supportsDemoUpload: boolean;
  supportsOneVsOne: boolean;
  defaultMapPool: string[];
  maps: GameMapOption[];
  sides: { id: string; label: string }[];
  positions: { id: string; label: string }[];
  identityField: string;
  identityLabel: string;
}

@Injectable({ providedIn: 'root' })
export class GamesService {
  private apiUrl = '/api/games';
  private cache$?: Observable<GameConfigApi[]>;

  constructor(private http: HttpClient) {}

  listGames(): Observable<GameConfigApi[]> {
    if (!this.cache$) {
      this.cache$ = this.http
        .get<GameConfigApi[]>(this.apiUrl)
        .pipe(shareReplay(1));
    }
    return this.cache$;
  }

  getGameLabel(gameId: string | undefined | null, games: GameConfigApi[]): string {
    const normalized = String(gameId ?? 'cs2').toLowerCase();
    return games.find((g) => g.id === normalized)?.label ?? 'Counter-Strike 2';
  }

  getGameTagline(gameId: string | undefined | null, games: GameConfigApi[]): string {
    const normalized = String(gameId ?? 'cs2').toLowerCase();
    return games.find((g) => g.id === normalized)?.tagline ?? 'Competições de Counter-Strike 2';
  }
}
