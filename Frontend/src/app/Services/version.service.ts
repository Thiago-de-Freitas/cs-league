import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';
import { BUILD_INFO, BuildInfo } from '../generated/build-info';
import { APP_NAME } from '../Utils/brand';

export interface AppVersionInfo {
  frontend: BuildInfo;
  frontendLabel: string;
  backend: BuildInfo | null;
  backendLabel: string | null;
}

@Injectable({ providedIn: 'root' })
export class VersionService {
  private backendCache$: Observable<BuildInfo | null> | null = null;

  constructor(private http: HttpClient) {}

  getFrontendBuild(): BuildInfo {
    return BUILD_INFO;
  }

  getFrontendLabel(): string {
    return this.formatLabel(BUILD_INFO);
  }

  getBackendBuild(): Observable<BuildInfo | null> {
    if (!this.backendCache$) {
      this.backendCache$ = this.http.get<{ build: BuildInfo }>('/api/health').pipe(
        map((res) => res.build ?? null),
        catchError(() => of(null)),
        shareReplay(1)
      );
    }
    return this.backendCache$;
  }

  getAppVersion(): Observable<AppVersionInfo> {
    return this.getBackendBuild().pipe(
      map((backend) => ({
        frontend: BUILD_INFO,
        frontendLabel: this.formatLabel(BUILD_INFO),
        backend,
        backendLabel: backend ? this.formatLabel(backend) : null,
      }))
    );
  }

  formatLabel(info: BuildInfo): string {
    const dirty = info.dirty ? '-dirty' : '';
    return `v${info.version} (${info.commit}${dirty})`;
  }

  /** Versão única exibida no rodapé do sistema. */
  getSystemVersionLabel(): string {
    return `v${BUILD_INFO.version}`;
  }

  getSystemVersionTooltip(): string {
    const front = BUILD_INFO;
    const dirty = front.dirty ? ' (dirty)' : '';
    return `${APP_NAME} ${front.version} · build ${front.buildTime} · ${front.branch}${dirty}`;
  }
}
