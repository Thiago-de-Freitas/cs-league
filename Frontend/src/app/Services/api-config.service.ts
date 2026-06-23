import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, shareReplay, tap } from 'rxjs';

interface RuntimeConfig {
  apiBaseUrl?: string;
}

/**
 * Em produção (front separado), uploads grandes vão direto à API pública
 * para evitar timeout do proxy Railway (~30–40s no cs-league-front).
 */
@Injectable({ providedIn: 'root' })
export class ApiConfigService {
  private apiBaseUrl: string | null = null;
  private load$: Observable<string> | null = null;

  constructor(private http: HttpClient) {}

  private loadApiBaseUrl(): Observable<string> {
    if (this.apiBaseUrl !== null) {
      return of(this.apiBaseUrl);
    }
    if (!this.load$) {
      this.load$ = this.http.get<RuntimeConfig>('/runtime-config.json').pipe(
        map((cfg) => (cfg.apiBaseUrl ?? '').replace(/\/+$/, '')),
        tap((base) => {
          this.apiBaseUrl = base;
        }),
        catchError(() => of('')),
        shareReplay(1)
      );
    }
    return this.load$;
  }

  /** URL absoluta para POST de demo; fallback relativo em dev local. */
  getDemoUploadUrl(): Observable<string> {
    return this.loadApiBaseUrl().pipe(
      map((base) => (base ? `${base}/api/demos/upload` : '/api/demos/upload'))
    );
  }
}
