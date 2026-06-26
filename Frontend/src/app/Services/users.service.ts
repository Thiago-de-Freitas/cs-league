import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AdminUserEntry, AdminUsersPage, PublicUserProfile } from '../Models/interfaces';

export const ADMIN_USER_PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
export type AdminUserPageSize = (typeof ADMIN_USER_PAGE_SIZE_OPTIONS)[number];

@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly apiUrl = '/api/users';

  constructor(private http: HttpClient) {}

  listUsers(options: {
    page?: number;
    pageSize?: number;
    q?: string;
    position?: string;
    role?: string;
    status?: string;
  } = {}): Observable<AdminUsersPage> {
    let params = new HttpParams()
      .set('page', String(options.page ?? 1))
      .set('limit', String(options.pageSize ?? 10));
    if (options.q?.trim()) params = params.set('q', options.q.trim());
    if (options.position) params = params.set('position', options.position);
    if (options.role) params = params.set('role', options.role);
    if (options.status) params = params.set('status', options.status);
    return this.http.get<AdminUsersPage>(this.apiUrl, { params });
  }

  deactivateUser(userId: string): Observable<{ user: AdminUserEntry }> {
    return this.http.patch<{ user: AdminUserEntry }>(`${this.apiUrl}/${userId}/deactivate`, {});
  }

  activateUser(userId: string): Observable<{ user: AdminUserEntry }> {
    return this.http.patch<{ user: AdminUserEntry }>(`${this.apiUrl}/${userId}/activate`, {});
  }

  banUser(userId: string, days: number): Observable<{ user: AdminUserEntry }> {
    return this.http.post<{ user: AdminUserEntry }>(`${this.apiUrl}/${userId}/ban`, { days });
  }

  unbanUser(userId: string): Observable<{ user: AdminUserEntry }> {
    return this.http.delete<{ user: AdminUserEntry }>(`${this.apiUrl}/${userId}/ban`);
  }

  deleteUser(userId: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.apiUrl}/${userId}`);
  }

  getUserProfile(userId: string): Observable<PublicUserProfile> {
    return this.http.get<PublicUserProfile>(`${this.apiUrl}/${userId}/profile`);
  }

  resolveUserIdBySteamId(steamId: string): Observable<{ userId: string }> {
    return this.http.get<{ userId: string }>(`${this.apiUrl}/by-steam/${encodeURIComponent(steamId)}`);
  }
}
