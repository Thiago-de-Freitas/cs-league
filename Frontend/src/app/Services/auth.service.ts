import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { AuthResponse, User } from '../Models/interfaces';

const TOKEN_KEY = 'cs_league_token';
const USER_KEY = 'cs_league_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private apiUrl = '/api/auth';
  private currentUserSubject = new BehaviorSubject<User | null>(this.loadUser());
  currentUser$ = this.currentUserSubject.asObservable();

  constructor(private http: HttpClient) {}

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
    this.currentUserSubject.next(null);
  }

  getMe(): Observable<User> {
    return this.http.get<User>(`${this.apiUrl}/me`).pipe(
      tap((user) => {
        localStorage.setItem(USER_KEY, JSON.stringify(user));
        this.currentUserSubject.next(user);
      })
    );
  }

  updateProfile(data: { displayName?: string; steamId?: string }): Observable<User> {
    return this.http.patch<User>(`${this.apiUrl}/me`, data).pipe(
      tap((user) => {
        localStorage.setItem(USER_KEY, JSON.stringify(user));
        this.currentUserSubject.next(user);
      })
    );
  }

  isAdmin(): Observable<boolean> {
    return new Observable((observer) => {
      const user = this.currentUserSubject.value;
      observer.next(user?.role === 'ADMIN');
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
    this.currentUserSubject.next(res.user);
  }
}
