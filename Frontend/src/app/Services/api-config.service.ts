import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, shareReplay, tap } from 'rxjs';

interface RuntimeConfig {
  apiBaseUrl?: string;
}

const DEV_API_PORT = '3000';

function isLocalDevHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

/**
 * Em produção (front separado), uploads grandes vão direto à API pública
 * para evitar timeout do proxy Railway (~30–40s no gamers-league-front).
 * Em dev local, também bypassa o proxy do ng serve para arquivos grandes.
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
      map((base) => {
        if (base) {
          return `${base}/api/demos/upload`;
        }
        if (typeof window !== 'undefined' && isLocalDevHost(window.location.hostname)) {
          return `http://${window.location.hostname}:${DEV_API_PORT}/api/demos/upload`;
        }
        return '/api/demos/upload';
      })
    );
  }
}
