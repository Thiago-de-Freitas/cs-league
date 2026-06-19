import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, interval, switchMap, takeWhile, startWith } from 'rxjs';
import { Demo, MatchPlayerStat, PersonalDemoValidation, PersonalStatsOverview } from '../Models/interfaces';

@Injectable({ providedIn: 'root' })
export class DemoService {
  private apiUrl = '/api/demos';

  constructor(private http: HttpClient) {}

  uploadDemo(file: File, options?: { matchId?: string; isPersonal?: boolean }): Observable<Demo> {
    const formData = new FormData();
    formData.append('demo', file);
    if (options?.matchId) {
      formData.append('matchId', options.matchId);
    }
    if (options?.isPersonal) {
      formData.append('isPersonal', 'true');
    }
    return this.http.post<Demo>(`${this.apiUrl}/upload`, formData);
  }

  validatePersonalDemo(): Observable<PersonalDemoValidation> {
    return this.http.get<PersonalDemoValidation>(`${this.apiUrl}/validate-personal`);
  }

  listDemos(): Observable<Demo[]> {
    return this.http.get<Demo[]>(this.apiUrl);
  }

  listPersonalDemos(): Observable<Demo[]> {
    return this.http.get<Demo[]>(`${this.apiUrl}/personal`);
  }

  getPersonalStatsOverview(): Observable<PersonalStatsOverview> {
    return this.http.get<PersonalStatsOverview>(`${this.apiUrl}/personal/overview`);
  }

  getDemo(id: string): Observable<Demo> {
    return this.http.get<Demo>(`${this.apiUrl}/${id}`);
  }

  getDemoStats(id: string): Observable<MatchPlayerStat[]> {
    return this.http.get<MatchPlayerStat[]>(`${this.apiUrl}/${id}/stats`);
  }

  associateMatch(demoId: string, matchId: string): Observable<Demo> {
    return this.http.patch<Demo>(`${this.apiUrl}/${demoId}/match`, { matchId });
  }

  reprocessDemo(demoId: string): Observable<Demo> {
    return this.http.post<Demo>(`${this.apiUrl}/${demoId}/reprocess`, {});
  }

  deleteDemo(demoId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${demoId}`);
  }

  pollPendingDemos(intervalMs = 3000): Observable<Demo[]> {
    return interval(intervalMs).pipe(
      startWith(0),
      switchMap(() => this.listDemos()),
      takeWhile(
        (demos) => demos.some((d) => d.status === 'pending' || d.status === 'processing'),
        true
      )
    );
  }

  pollPendingPersonalDemos(intervalMs = 3000): Observable<Demo[]> {
    return interval(intervalMs).pipe(
      startWith(0),
      switchMap(() => this.listPersonalDemos()),
      takeWhile(
        (demos) => demos.some((d) => d.status === 'pending' || d.status === 'processing'),
        true
      )
    );
  }

  pollDemoStatus(demoId: string, intervalMs = 3000): Observable<Demo> {
    return interval(intervalMs).pipe(
      startWith(0),
      switchMap(() => this.getDemo(demoId)),
      takeWhile((demo) => demo.status === 'pending' || demo.status === 'processing', true)
    );
  }
}
