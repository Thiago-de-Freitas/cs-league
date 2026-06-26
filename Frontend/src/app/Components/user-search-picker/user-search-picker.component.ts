import { Component, EventEmitter, Input, OnDestroy, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription, debounceTime, distinctUntilChanged, switchMap, of, catchError } from 'rxjs';
import { TeamService } from '../../Services/team.service';
import { User } from '../../Models/interfaces';
import { getPlayerPositionLabel } from '../../Utils/player-positions';
import { resolveUploadAssetUrl } from '../../Utils/upload-asset.util';
import { splitBySearchQuery } from '../../Utils/user-search.util';

@Component({
  selector: 'app-user-search-picker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="user-search-picker">
      <label *ngIf="label" class="form-label" [attr.for]="inputId">{{ label }}</label>
      <div class="user-search-input-wrap">
        <span class="user-search-icon" aria-hidden="true">⌕</span>
        <input
          [id]="inputId"
          type="search"
          class="input-field user-search-input"
          [(ngModel)]="query"
          (ngModelChange)="onQueryInput()"
          [placeholder]="placeholder"
          [disabled]="disabled"
          autocomplete="off"
          spellcheck="false">
        <span *ngIf="searching" class="user-search-spinner" aria-hidden="true"></span>
      </div>

      <p *ngIf="query.trim().length === 1" class="form-hint user-search-hint">
        Digite pelo menos 2 caracteres para buscar.
      </p>

      <ul *ngIf="results.length > 0" class="user-search-results" role="listbox" [attr.aria-label]="'Resultados da busca'">
        <li *ngFor="let user of results; trackBy: trackUser" class="user-search-result" role="option">
          <div class="user-search-avatar" [class.has-image]="avatarSrc(user)">
            <img
              *ngIf="avatarSrc(user) as src"
              [src]="src"
              [alt]="user.displayName"
              class="user-search-avatar-img"
              (error)="onAvatarError(user.id)">
            <span *ngIf="!avatarSrc(user)" class="user-search-avatar-fallback">
              {{ user.displayName.charAt(0).toUpperCase() }}
            </span>
          </div>

          <div class="user-search-body">
            <div class="user-search-name-row">
              <span class="user-search-name">
                <ng-container *ngIf="nameParts(user) as parts">
                  <span>{{ parts.pre }}</span><mark *ngIf="parts.hit" class="user-search-mark">{{ parts.hit }}</mark><span>{{ parts.post }}</span>
                </ng-container>
              </span>
              <span *ngIf="user.position" class="badge badge-gray user-search-position">
                {{ formatPosition(user.position) }}
              </span>
            </div>
            <span class="user-search-meta">
              <ng-container *ngIf="emailParts(user) as ep">
                <span>{{ ep.pre }}</span><mark *ngIf="ep.hit" class="user-search-mark">{{ ep.hit }}</mark><span>{{ ep.post }}</span>
              </ng-container>
            </span>
            <span *ngIf="user.steamId" class="user-search-steam">Steam: {{ user.steamId }}</span>
          </div>

          <button
            type="button"
            class="btn btn-primary btn-small user-search-action"
            [disabled]="disabled"
            (click)="pick(user)">
            {{ actionLabel }}
          </button>
        </li>
      </ul>

      <p *ngIf="showEmpty" class="user-search-empty meta">
        Nenhum usuário encontrado para "{{ query.trim() }}".
      </p>
    </div>
  `,
  styles: [`
    .user-search-picker {
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
    }

    .user-search-input-wrap {
      position: relative;
      display: flex;
      align-items: center;
    }

    .user-search-icon {
      position: absolute;
      left: 0.85rem;
      color: var(--gc-text-secondary);
      font-size: 1rem;
      pointer-events: none;
      line-height: 1;
    }

    .user-search-input {
      width: 100%;
      padding-left: 2.25rem;
      padding-right: 2.25rem;
    }

    .user-search-spinner {
      position: absolute;
      right: 0.85rem;
      width: 1rem;
      height: 1rem;
      border: 2px solid var(--gc-border);
      border-top-color: var(--gc-orange);
      border-radius: 50%;
      animation: user-search-spin 0.7s linear infinite;
    }

    @keyframes user-search-spin {
      to { transform: rotate(360deg); }
    }

    .user-search-results {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .user-search-result {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem;
      border: 1px solid var(--gc-border);
      border-radius: var(--radius-md);
      background: var(--gc-surface);
      transition: border-color 0.15s, background 0.15s;
    }

    .user-search-result:hover {
      border-color: var(--gc-orange);
      background: var(--gc-bg-secondary);
    }

    .user-search-avatar {
      flex-shrink: 0;
      width: 2.5rem;
      height: 2.5rem;
      border-radius: 50%;
      overflow: hidden;
      background: var(--gc-bg-secondary);
      border: 1px solid var(--gc-border);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .user-search-avatar-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .user-search-avatar-fallback {
      font-family: var(--font-display);
      font-size: 0.95rem;
      color: var(--gc-orange);
    }

    .user-search-body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }

    .user-search-name-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.4rem 0.5rem;
    }

    .user-search-name {
      font-weight: 600;
      color: var(--gc-text);
      font-family: var(--font-body);
    }

    .user-search-meta,
    .user-search-steam {
      font-size: 0.82rem;
      color: var(--gc-text-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .user-search-position {
      text-transform: uppercase;
      letter-spacing: 0.04em;
      font-size: 0.68rem;
    }

    .user-search-mark {
      background: var(--gc-orange-dim);
      color: var(--gc-orange);
      padding: 0 0.1em;
      border-radius: 2px;
    }

    .user-search-action {
      flex-shrink: 0;
    }

    .user-search-empty {
      margin: 0;
      padding: 0.75rem;
      text-align: center;
      border: 1px dashed var(--gc-border);
      border-radius: var(--radius-md);
      background: var(--gc-bg-secondary);
    }

    .user-search-hint {
      margin: 0;
    }
  `],
})
export class UserSearchPickerComponent implements OnDestroy {
  @Input() label = '';
  @Input() placeholder = 'Buscar por nome, email ou Steam ID...';
  @Input() actionLabel = 'Adicionar';
  @Input() disabled = false;
  @Input() excludeUserIds: string[] = [];
  @Input() inputId = 'user-search-input';

  @Output() userPick = new EventEmitter<User>();

  query = '';
  results: User[] = [];
  searching = false;
  searched = false;

  private readonly query$ = new Subject<string>();
  private readonly brokenAvatars = new Set<string>();
  private sub?: Subscription;

  constructor(private teamService: TeamService) {
    this.sub = this.query$.pipe(
      debounceTime(280),
      distinctUntilChanged(),
      switchMap((q) => {
        const trimmed = q.trim();
        if (trimmed.length < 2) {
          this.searching = false;
          this.searched = false;
          return of([] as User[]);
        }
        this.searching = true;
        return this.teamService.searchUsers(trimmed).pipe(
          catchError(() => of([] as User[]))
        );
      })
    ).subscribe((users) => {
      const excluded = new Set(this.excludeUserIds);
      this.results = users.filter((u) => !excluded.has(u.id));
      this.searching = false;
      this.searched = this.query.trim().length >= 2;
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  get showEmpty(): boolean {
    return this.searched && !this.searching && this.results.length === 0 && this.query.trim().length >= 2;
  }

  onQueryInput(): void {
    if (this.query.trim().length < 2) {
      this.results = [];
      this.searched = false;
    }
    this.query$.next(this.query);
  }

  pick(user: User): void {
    this.userPick.emit(user);
    this.query = '';
    this.results = [];
    this.searched = false;
  }

  trackUser(_index: number, user: User): string {
    return user.id;
  }

  formatPosition(position: string | null | undefined): string {
    return getPlayerPositionLabel(position);
  }

  nameParts(user: User) {
    return splitBySearchQuery(user.displayName, this.query);
  }

  emailParts(user: User) {
    return splitBySearchQuery(user.email, this.query);
  }

  avatarSrc(user: User): string | null {
    if (this.brokenAvatars.has(user.id) || !user.avatarUrl) return null;
    return resolveUploadAssetUrl(user.avatarUrl);
  }

  onAvatarError(userId: string): void {
    this.brokenAvatars.add(userId);
  }
}
