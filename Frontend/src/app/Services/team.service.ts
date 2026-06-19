import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Team, TeamInvite, User } from '../Models/interfaces';

@Injectable({ providedIn: 'root' })
export class TeamService {
  private apiUrl = '/api/teams';

  constructor(private http: HttpClient) {}

  getTeams(): Observable<Team[]> {
    return this.http.get<Team[]>(this.apiUrl);
  }

  getTeamById(id: string): Observable<Team> {
    return this.http.get<Team>(`${this.apiUrl}/${id}`);
  }

  createTeam(name: string, tag: string): Observable<Team> {
    return this.http.post<Team>(this.apiUrl, { name, tag });
  }

  updateTeam(id: string, data: { name?: string; tag?: string }): Observable<Team> {
    return this.http.put<Team>(`${this.apiUrl}/${id}`, data);
  }

  deleteTeam(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  uploadLogo(teamId: string, file: File): Observable<Team> {
    const formData = new FormData();
    formData.append('logo', file);
    return this.http.post<Team>(`${this.apiUrl}/${teamId}/logo`, formData);
  }

  removeLogo(teamId: string): Observable<Team> {
    return this.http.delete<Team>(`${this.apiUrl}/${teamId}/logo`);
  }

  inviteUser(teamId: string, userId: string): Observable<unknown> {
    return this.http.post(`${this.apiUrl}/${teamId}/invite`, { userId });
  }

  rejectInvite(teamId: string, inviteId: string): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(`${this.apiUrl}/${teamId}/invites/${inviteId}/reject`, {});
  }

  acceptInvite(teamId: string, inviteId: string): Observable<Team> {
    return this.http.post<Team>(`${this.apiUrl}/${teamId}/invites/${inviteId}/accept`, {});
  }

  getPendingInvites(): Observable<TeamInvite[]> {
    return this.http.get<TeamInvite[]>(`${this.apiUrl}/invites/pending`);
  }

  searchUsers(query: string): Observable<User[]> {
    return this.http.get<User[]>(`/api/users/search?q=${encodeURIComponent(query)}`);
  }
}
