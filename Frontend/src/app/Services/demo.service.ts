import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, defer, from, map, switchMap, filter, interval, takeWhile, startWith } from 'rxjs';
import { Demo, MatchPlayerStat, PersonalDemoValidation, PersonalHighlightsResponse, PersonalStatsOverview, HighlightProgress } from '../Models/interfaces';

export interface DemoUploadProgress {
  phase: 'uploading' | 'done';
  progress: number;
  demo?: Demo;
}

export interface DemoUploadSession {
  uploadId: string;
  chunkBytes: number;
  totalChunks: number;
}

export interface DemoHealthConfig {
  redis?: { queueAvailable?: boolean };
  redisErrors?: string[];
  warnings?: string[];
  demoMaxUploadMb?: number;
  demoUploadChunkBytes?: number;
}

const DEFAULT_CHUNK_BYTES = 4 * 1024 * 1024;

@Injectable({ providedIn: 'root' })
export class DemoService {
  private apiUrl = '/api/demos';

  constructor(private http: HttpClient) {}

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
    return this.getDemoHealthConfig().pipe(
      switchMap((config) => {
        const chunkBytes = config.demoUploadChunkBytes && config.demoUploadChunkBytes > 0
          ? config.demoUploadChunkBytes
          : DEFAULT_CHUNK_BYTES;
        return defer(() => from(this.runChunkedUpload(file, options, chunkBytes)));
      })
    );
  }

  private async *runChunkedUpload(
    file: File,
    options: { matchId?: string; isPersonal?: boolean } | undefined,
    chunkBytes: number
  ): AsyncGenerator<DemoUploadProgress> {
    const totalChunks = Math.max(1, Math.ceil(file.size / chunkBytes));
    const session = await new Promise<DemoUploadSession>((resolve, reject) => {
      this.http.post<DemoUploadSession>(`${this.apiUrl}/upload/sessions`, {
        fileName: file.name,
        fileSize: file.size,
        totalChunks,
        isPersonal: options?.isPersonal ?? false,
        ...(options?.matchId ? { matchId: options.matchId } : {}),
      }).subscribe({ next: resolve, error: reject });
    });

    yield { phase: 'uploading', progress: 0 };

    for (let index = 0; index < totalChunks; index++) {
      const start = index * chunkBytes;
      const end = Math.min(start + chunkBytes, file.size);
      const chunk = file.slice(start, end);
      await new Promise<void>((resolve, reject) => {
        this.http.put<{ ok: boolean }>(
          `${this.apiUrl}/upload/sessions/${session.uploadId}/chunks/${index}`,
          chunk,
          { headers: { 'Content-Type': 'application/octet-stream' } }
        ).subscribe({ next: () => resolve(), error: reject });
      });
      const progress = Math.min(95, Math.round(((index + 1) / totalChunks) * 95));
      yield { phase: 'uploading', progress };
    }

    const demo = await new Promise<Demo>((resolve, reject) => {
      this.http.post<Demo>(`${this.apiUrl}/upload/sessions/${session.uploadId}/complete`, {})
        .subscribe({ next: resolve, error: reject });
    });
    yield { phase: 'done', progress: 100, demo };
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

  getHighlightProgress(demoId: string): Observable<HighlightProgress> {
    return this.http.get<HighlightProgress>(`${this.apiUrl}/${demoId}/highlights/progress`);
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

  deleteDemoHighlight(demoId: string, highlightId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${demoId}/highlights/${highlightId}`);
  }

  deleteAllDemoHighlights(demoId: string): Observable<{ ok: boolean; deleted: number }> {
    return this.http.delete<{ ok: boolean; deleted: number }>(`${this.apiUrl}/${demoId}/highlights`);
  }

  deleteAllPersonalHighlights(): Observable<{ ok: boolean; deleted: number }> {
    return this.http.delete<{ ok: boolean; deleted: number }>(`${this.apiUrl}/personal/highlights`);
  }
}
