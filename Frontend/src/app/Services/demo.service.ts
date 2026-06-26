import { Injectable } from '@angular/core';
import { HttpClient, HttpEvent, HttpEventType } from '@angular/common/http';
import { Observable, interval, switchMap, takeWhile, startWith, filter, map } from 'rxjs';
import { Demo, MatchPlayerStat, PersonalDemoValidation, PersonalHighlightsResponse, PersonalStatsOverview } from '../Models/interfaces';
import { ApiConfigService } from './api-config.service';

export interface DemoUploadProgress {
  phase: 'uploading' | 'done';
  progress: number;
  demo?: Demo;
}

export interface DemoHealthConfig {
  redis?: { queueAvailable?: boolean };
  redisErrors?: string[];
  warnings?: string[];
}

@Injectable({ providedIn: 'root' })
export class DemoService {
  private apiUrl = '/api/demos';

  constructor(
    private http: HttpClient,
    private apiConfig: ApiConfigService
  ) {}

  getDemoHealthConfig(): Observable<DemoHealthConfig> {
    return this.http.get<DemoHealthConfig>('/api/health/config');
  }

  uploadDemo(file: File, options?: { matchId?: string; isPersonal?: boolean }): Observable<Demo> {
    return this.uploadDemoWithProgress(file, options).pipe(
      filter((e): e is DemoUploadProgress & { demo: Demo } => e.phase === 'done' && !!e.demo),
      map((e) => e.demo)
    );
  }

  uploadDemoWithProgress(
    file: File,
    options?: { matchId?: string; isPersonal?: boolean }
  ): Observable<DemoUploadProgress> {
    const formData = new FormData();
    formData.append('demo', file);
    if (options?.matchId) {
      formData.append('matchId', options.matchId);
    }
    if (options?.isPersonal) {
      formData.append('isPersonal', 'true');
    }
    return this.apiConfig.getDemoUploadUrl().pipe(
      switchMap((uploadUrl) =>
        this.http.post<Demo>(uploadUrl, formData, {
          reportProgress: true,
          observe: 'events',
        })
      ),
      map((event: HttpEvent<Demo>) => {
        if (event.type === HttpEventType.UploadProgress) {
          const total = event.total ?? file.size;
          const progress = total > 0 ? Math.round((100 * event.loaded) / total) : 0;
          return { phase: 'uploading' as const, progress };
        }
        if (event.type === HttpEventType.Response) {
          return { phase: 'done' as const, progress: 100, demo: event.body ?? undefined };
        }
        return { phase: 'uploading' as const, progress: 0 };
      }),
      filter((e) => e.phase === 'uploading' || e.demo != null)
    );
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

  listPersonalHighlights(): Observable<PersonalHighlightsResponse> {
    return this.http.get<PersonalHighlightsResponse>(`${this.apiUrl}/personal/highlights`);
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

  disassociateMatch(demoId: string): Observable<Demo> {
    return this.http.patch<Demo>(`${this.apiUrl}/${demoId}/match`, { matchId: null });
  }

  associateMatch(demoId: string, matchId: string): Observable<Demo> {
    return this.http.patch<Demo>(`${this.apiUrl}/${demoId}/match`, { matchId });
  }

  reprocessDemo(demoId: string): Observable<Demo> {
    return this.http.post<Demo>(`${this.apiUrl}/${demoId}/reprocess`, {});
  }

  requeuePendingPersonalDemos(): Observable<{ requeued: number; skipped: { id: string; fileName: string; reason: string }[]; total: number }> {
    return this.http.post<{ requeued: number; skipped: { id: string; fileName: string; reason: string }[]; total: number }>(
      `${this.apiUrl}/personal/requeue-pending`,
      {}
    );
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

  downloadDemoHighlightClip(demoId: string, highlightId: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/${demoId}/highlights/${highlightId}/clip?format=vdm`, {
      responseType: 'blob',
      headers: { Accept: 'text/plain' },
    });
  }

  downloadDemoHighlightVideo(demoId: string, highlightId: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/${demoId}/highlights/${highlightId}/video`, {
      responseType: 'blob',
    });
  }

  generateHighlights(demoId: string): Observable<{ ok: boolean; message: string }> {
    return this.http.post<{ ok: boolean; message: string }>(`${this.apiUrl}/${demoId}/highlights/generate`, {});
  }
}
