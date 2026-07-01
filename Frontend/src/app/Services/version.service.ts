import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';
import { normalizeBuildInfo, type BuildInfo } from '../Models/build-info';
import { BUILD_INFO } from '../generated/build-info';
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
    return normalizeBuildInfo(BUILD_INFO);
  }

  getFrontendLabel(): string {
    return this.formatLabel(this.getFrontendBuild());
  }

  getBackendBuild(): Observable<BuildInfo | null> {
    if (!this.backendCache$) {
      this.backendCache$ = this.http.get<{ build: Partial<BuildInfo> & Pick<BuildInfo, 'component' | 'name' | 'version' | 'commit' | 'commitFull' | 'branch' | 'buildTime' | 'dirty'> }>('/api/health').pipe(
        map((res) => (res.build ? normalizeBuildInfo(res.build) : null)),
        catchError(() => of(null)),
        shareReplay(1)
      );
    }
    return this.backendCache$;
  }

  getAppVersion(): Observable<AppVersionInfo> {
    return this.getBackendBuild().pipe(
      map((backend) => {
        const frontend = this.getFrontendBuild();
        return {
          frontend,
          frontendLabel: this.formatLabel(frontend),
          backend,
          backendLabel: backend ? this.formatLabel(backend) : null,
        };
      })
    );
  }

  formatLabel(info: BuildInfo): string {
    const dirty = info.dirty ? '-dirty' : '';
    const build = info.commitCount ?? 0;
    const versionCore = build > 0 ? `v${info.version}+${build}` : `v${info.version}`;
    return `${versionCore} (${info.commit}${dirty})`;
  }

  /** Versão única exibida no rodapé do sistema. */
  getSystemVersionLabel(): string {
    const front = this.getFrontendBuild();
    const build = front.commitCount ?? 0;
    return build > 0 ? `v${front.version}+${build}` : `v${front.version}`;
  }

  getSystemVersionTooltip(): string {
    const front = this.getFrontendBuild();
    const dirty = front.dirty ? ' · working tree dirty' : '';
    const sinceTag = front.versionTag
      ? `${front.commitsSinceVersion} commit(s) desde ${front.versionTag}`
      : `${front.commitsSinceVersion ?? front.commitCount ?? 0} commit(s) no repositório`;
    const subject = front.commitSubject ? `\n${front.commitSubject}` : '';
    return `${APP_NAME} ${this.getSystemVersionLabel()} · ${sinceTag} · ${front.commit} · ${front.branch}${dirty}${subject}`;
  }
}
