import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, interval, switchMap, takeWhile, map, startWith } from 'rxjs';
import { Demo, MatchPlayerStat } from '../Models/interfaces';

@Injectable({ providedIn: 'root' })
export class DemoService {
  private apiUrl = '/api/demos';

  constructor(private http: HttpClient) {}

  uploadDemo(file: File, matchId?: string): Observable<Demo> {
    const formData = new FormData();
    formData.append('demo', file);
    if (matchId) {
      formData.append('matchId', matchId);
    }
    return this.http.post<Demo>(`${this.apiUrl}/upload`, formData);
  }

  getDemo(id: string): Observable<Demo> {
    return this.http.get<Demo>(`${this.apiUrl}/${id}`);
  }

  getDemoStats(id: string): Observable<MatchPlayerStat[]> {
    return this.http.get<MatchPlayerStat[]>(`${this.apiUrl}/${id}/stats`);
  }

  listDemos(): Observable<Demo[]> {
    return this.http.get<Demo[]>(this.apiUrl);
  }

  associateMatch(demoId: string, matchId: string): Observable<Demo> {
    return this.http.patch<Demo>(`${this.apiUrl}/${demoId}/match`, { matchId });
  }

  pollDemoStatus(demoId: string, intervalMs = 3000): Observable<Demo> {
    return interval(intervalMs).pipe(
      startWith(0),
      switchMap(() => this.getDemo(demoId)),
      takeWhile((demo) => demo.status === 'pending' || demo.status === 'processing', true)
    );
  }
}
