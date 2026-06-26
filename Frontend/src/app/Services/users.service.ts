import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AdminUsersPage } from '../Models/interfaces';

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
  } = {}): Observable<AdminUsersPage> {
    let params = new HttpParams()
      .set('page', String(options.page ?? 1))
      .set('limit', String(options.pageSize ?? 10));
    if (options.q?.trim()) params = params.set('q', options.q.trim());
    if (options.position) params = params.set('position', options.position);
    if (options.role) params = params.set('role', options.role);
    return this.http.get<AdminUsersPage>(this.apiUrl, { params });
  }
}
