import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, shareReplay, tap } from 'rxjs';
import { Team, TeamInvite, User } from '../Models/interfaces';

@Injectable({ providedIn: 'root' })
export class TeamService {
  private apiUrl = '/api/teams';
  private teamsCache: Observable<Team[]> | null = null;
  private invitesCache: Observable<TeamInvite[]> | null = null;

  constructor(private http: HttpClient) {}

  invalidateTeams(): void {
    this.teamsCache = null;
  }

  invalidateInvites(): void {
    this.invitesCache = null;
  }

  invalidateAll(): void {
    this.invalidateTeams();
    this.invalidateInvites();
  }

  getTeams(): Observable<Team[]> {
    if (!this.teamsCache) {
      this.teamsCache = this.http.get<Team[]>(this.apiUrl).pipe(shareReplay(1));
    }
    return this.teamsCache;
  }

  getTeamById(id: string): Observable<Team> {
    return this.http.get<Team>(`${this.apiUrl}/${id}`);
  }

  createTeam(name: string, tag: string, options?: { ownerAsMember?: boolean }): Observable<Team> {
    return this.http.post<Team>(this.apiUrl, {
      name,
      tag,
      ownerAsMember: options?.ownerAsMember !== false,
    }).pipe(
      tap(() => this.invalidateTeams())
    );
  }

  updateTeam(id: string, data: { name?: string; tag?: string }): Observable<Team> {
    return this.http.put<Team>(`${this.apiUrl}/${id}`, data).pipe(
      tap(() => this.invalidateTeams())
    );
  }

  deleteTeam(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`).pipe(
      tap(() => this.invalidateAll())
    );
  }

  uploadLogo(teamId: string, file: File): Observable<Team> {
    const formData = new FormData();
    formData.append('logo', file);
    return this.http.post<Team>(`${this.apiUrl}/${teamId}/logo`, formData).pipe(
      tap(() => this.invalidateTeams())
    );
  }

  removeLogo(teamId: string): Observable<Team> {
    return this.http.delete<Team>(`${this.apiUrl}/${teamId}/logo`).pipe(
      tap(() => this.invalidateTeams())
    );
  }

  inviteUser(teamId: string, userId: string): Observable<unknown> {
    return this.http.post(`${this.apiUrl}/${teamId}/invite`, { userId });
  }

  rejectInvite(teamId: string, inviteId: string): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(`${this.apiUrl}/${teamId}/invites/${inviteId}/reject`, {}).pipe(
      tap(() => this.invalidateInvites())
    );
  }

  acceptInvite(teamId: string, inviteId: string): Observable<Team> {
    return this.http.post<Team>(`${this.apiUrl}/${teamId}/invites/${inviteId}/accept`, {}).pipe(
      tap(() => this.invalidateAll())
    );
  }

  getPendingInvites(): Observable<TeamInvite[]> {
    if (!this.invitesCache) {
      this.invitesCache = this.http.get<TeamInvite[]>(`${this.apiUrl}/invites/pending`).pipe(shareReplay(1));
    }
    return this.invitesCache;
  }

  addMember(teamId: string, userId: string, role: 'CAPTAIN' | 'MEMBER' = 'MEMBER'): Observable<Team> {
    return this.http.post<Team>(`${this.apiUrl}/${teamId}/members`, { userId, role }).pipe(
      tap(() => this.invalidateTeams())
    );
  }

  updateMember(
    teamId: string,
    userId: string,
    data: { role?: 'CAPTAIN' | 'MEMBER'; memberTag?: string | null }
  ): Observable<Team> {
    return this.http.patch<Team>(`${this.apiUrl}/${teamId}/members/${userId}`, data).pipe(
      tap(() => this.invalidateTeams())
    );
  }

  updateMemberRole(teamId: string, userId: string, role: 'CAPTAIN' | 'MEMBER'): Observable<Team> {
    return this.updateMember(teamId, userId, { role });
  }

  removeMember(teamId: string, userId: string): Observable<Team> {
    return this.http.delete<Team>(`${this.apiUrl}/${teamId}/members/${userId}`).pipe(
      tap(() => this.invalidateTeams())
    );
  }

  searchUsers(query: string): Observable<User[]> {
    return this.http.get<User[]>(`/api/users/search?q=${encodeURIComponent(query)}`);
  }
}
