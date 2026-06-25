import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuditEvent } from '../Models/interfaces';

export interface AuditEventsPage {
  events: AuditEvent[];
  nextCursor: string | null;
}

@Injectable({ providedIn: 'root' })
export class AuditService {
  private readonly apiUrl = '/api/audit';

  constructor(private http: HttpClient) {}

  getLeagueActivity(leagueId: string, limit = 50, cursor?: string | null): Observable<AuditEventsPage> {
    let params = new HttpParams().set('limit', String(limit));
    if (cursor) params = params.set('cursor', cursor);
    return this.http.get<AuditEventsPage>(`${this.apiUrl}/leagues/${leagueId}/activity`, { params });
  }

  getGlobalEvents(options: {
    limit?: number;
    cursor?: string | null;
    action?: string;
    entityType?: string;
    entityId?: string;
    actorUserId?: string;
    from?: string;
    to?: string;
  } = {}): Observable<AuditEventsPage> {
    let params = new HttpParams().set('limit', String(options.limit ?? 50));
    if (options.cursor) params = params.set('cursor', options.cursor);
    if (options.action) params = params.set('action', options.action);
    if (options.entityType) params = params.set('entityType', options.entityType);
    if (options.entityId) params = params.set('entityId', options.entityId);
    if (options.actorUserId) params = params.set('actorUserId', options.actorUserId);
    if (options.from) params = params.set('from', options.from);
    if (options.to) params = params.set('to', options.to);
    return this.http.get<AuditEventsPage>(`${this.apiUrl}/events`, { params });
  }
}
