import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, shareReplay, tap } from 'rxjs';
import { AuthResponse, User } from '../Models/interfaces';
import { LeagueService } from './league.service';
import { RankingsService } from './rankings.service';
import { TeamService } from './team.service';

const TOKEN_KEY = 'cs_league_token';
const USER_KEY = 'cs_league_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private apiUrl = '/api/auth';
  private currentUserSubject = new BehaviorSubject<User | null>(this.loadUser());
  private meCache: Observable<User> | null = null;
  currentUser$ = this.currentUserSubject.asObservable();

  constructor(
    private http: HttpClient,
    private teamService: TeamService,
    private leagueService: LeagueService,
    private rankingsService: RankingsService
  ) {}

  private loadUser(): User | null {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  get token(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  get isLoggedIn(): boolean {
    return !!this.token;
  }

  get currentUser(): User | null {
    return this.currentUserSubject.value;
  }

  register(email: string, password: string, displayName: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/register`, { email, password, displayName }).pipe(
      tap((res) => this.setSession(res))
    );
  }

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, { email, password }).pipe(
      tap((res) => this.setSession(res))
    );
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.meCache = null;
    this.currentUserSubject.next(null);
    this.teamService.invalidateAll();
    this.leagueService.invalidateLeagues();
    this.rankingsService.invalidateAll();
  }

  getMe(): Observable<User> {
    if (!this.meCache) {
      this.meCache = this.http.get<User>(`${this.apiUrl}/me`).pipe(
        tap((user) => {
          localStorage.setItem(USER_KEY, JSON.stringify(user));
          this.currentUserSubject.next(user);
        }),
        shareReplay(1)
      );
    }
    return this.meCache;
  }

  updateProfile(data: { displayName?: string; steamId?: string | null; position?: string | null }): Observable<User> {
    return this.http.patch<User>(`${this.apiUrl}/me`, data).pipe(
      tap((user) => this.applyUserUpdate(user))
    );
  }

  uploadAvatar(file: File): Observable<User> {
    const formData = new FormData();
    formData.append('avatar', file);
    return this.http.post<User>(`${this.apiUrl}/me/avatar`, formData).pipe(
      tap((user) => this.applyUserUpdate(user))
    );
  }

  removeAvatar(): Observable<User> {
    return this.http.delete<User>(`${this.apiUrl}/me/avatar`).pipe(
      tap((user) => this.applyUserUpdate(user))
    );
  }

  private applyUserUpdate(user: User): void {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    this.currentUserSubject.next(user);
    this.meCache = null;
  }

  isSystemAdmin(): boolean {
    return this.currentUserSubject.value?.role === 'ADMIN';
  }

  isParticipationBanned(): boolean {
    return this.currentUserSubject.value?.isBanned === true;
  }

  getBannedUntilLabel(): string | null {
    const until = this.currentUserSubject.value?.bannedUntil;
    if (!until) return null;
    const date = new Date(until);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleString('pt-BR');
  }

  isAdmin(): Observable<boolean> {
    return new Observable((observer) => {
      observer.next(this.isSystemAdmin());
      observer.complete();
    });
  }

  isLeagueOwner(leagueOwnerId: string): boolean {
    const user = this.currentUserSubject.value;
    return user?.role === 'ADMIN' || user?.id === leagueOwnerId;
  }

  isTeamOwner(teamOwnerId: string): boolean {
    const user = this.currentUserSubject.value;
    return user?.role === 'ADMIN' || user?.id === teamOwnerId;
  }

  canManageTeam(team: { ownerId?: string; players?: { id: string }[] }): boolean {
    const user = this.currentUserSubject.value;
    if (!user) return false;
    if (user.role === 'ADMIN') return true;
    if (team.ownerId && user.id === team.ownerId) return true;
    return team.players?.some((p) => p.id === user.id) ?? false;
  }

  private setSession(res: AuthResponse): void {
    localStorage.setItem(TOKEN_KEY, res.token);
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    this.meCache = null;
    this.teamService.invalidateAll();
    this.leagueService.invalidateLeagues();
    this.rankingsService.invalidateAll();
    this.currentUserSubject.next(res.user);
  }
}
