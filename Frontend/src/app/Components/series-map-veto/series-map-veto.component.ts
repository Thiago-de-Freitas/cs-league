import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatchService } from '../../Services/match.service';
import { Match, SeriesVetoState } from '../../Models/interfaces';
import { getMapLabel } from '../../Utils/maps';

@Component({
  selector: 'app-series-map-veto',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="gc-card map-veto-card" *ngIf="series && series.format === 'bo3'">
      <h2 class="section-title">Veto BO3 (estilo Valve)</h2>
      <p class="meta map-veto-intro" *ngIf="series.vetoStatus === 'ban_phase'">
        2 bans alternados, depois 2 picks. O mapa restante é o decider.
        Prazo final: <strong>2 dias antes</strong> do início da partida.
      </p>
      <p class="meta map-veto-deadline" *ngIf="series.vetoDeadlineAt">
        Veto permitido até {{ formatDeadline(series.vetoDeadlineAt) }}.
      </p>
      <p class="meta map-veto-warning" *ngIf="series.deadlineExpired">
        Prazo de veto encerrado. Somente um administrador pode reabrir o map pool.
      </p>
      <p class="meta map-veto-reopened" *ngIf="series.vetoReopenedByAdmin">
        Map pool reaberto por administrador — nova rodada de veto em andamento.
      </p>
      <p class="meta map-veto-intro" *ngIf="series.vetoStatus === 'pick_phase'">
        Escolha os mapas do BO3. Cada time faz um pick alternado.
      </p>
      <p class="meta map-veto-intro" *ngIf="series.vetoStatus === 'maps_assigned' || series.vetoStatus === 'completed'">
        Mapas definidos
        <span *ngIf="series.autoResolved"> (ações automáticas por tempo esgotado)</span>.
        Placar da série: {{ series.team1MapWins }} – {{ series.team2MapWins }}
      </p>

      <button
        *ngIf="canAdminReopen"
        type="button"
        class="btn btn-primary btn-small map-veto-reopen"
        [disabled]="reopenLoading"
        (click)="reopenVeto()">
        {{ reopenLoading ? 'Reabrindo...' : 'Reabrir map pool (admin)' }}
      </button>

      <div class="map-pool-grid">
        <span
          *ngFor="let map of series.mapPool"
          class="map-chip"
          [class.is-banned]="series.bannedMaps.includes(map)"
          [class.is-picked]="series.pickedMaps.includes(map)"
          [class.is-available]="isAvailable(map)">
          {{ getMapLabel(map) }}
        </span>
      </div>

      <div class="series-games" *ngIf="series.assignedMaps?.length">
        <p class="form-label">Jogos da série</p>
        <ul class="gc-list">
          <li *ngFor="let g of series.assignedMaps" class="gc-list-item">
            Mapa {{ g.game }}: <strong>{{ g.map ? getMapLabel(g.map) : '—' }}</strong>
            <span *ngIf="gameMatch(g.game) as gm" class="meta"> · {{ gm.status }}</span>
          </li>
        </ul>
      </div>

      <div class="map-veto-actions" *ngIf="canAct && series.vetoStatus === 'ban_phase' && isMyTurn()">
        <p class="form-label">Seu time deve banir um mapa</p>
        <div class="map-ban-buttons">
          <button
            type="button"
            class="btn btn-danger btn-small"
            *ngFor="let map of availableMaps"
            [disabled]="actionLoading"
            (click)="banMap(map)">
            Ban {{ getMapLabel(map) }}
          </button>
        </div>
      </div>

      <div class="map-veto-actions" *ngIf="canAct && series.vetoStatus === 'pick_phase' && isMyTurn()">
        <p class="form-label">Seu time deve escolher um mapa</p>
        <div class="map-ban-buttons">
          <button
            type="button"
            class="btn btn-primary btn-small"
            *ngFor="let map of availableForPick"
            [disabled]="actionLoading"
            (click)="pickMap(map)">
            Pick {{ getMapLabel(map) }}
          </button>
        </div>
      </div>

      <p *ngIf="actionError" class="error-message">{{ actionError }}</p>
    </section>
  `,
  styles: [`
    .map-veto-card { margin-top: 1rem; }
    .map-veto-intro { margin-bottom: 1rem; }
    .map-pool-grid { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1rem; }
    .map-chip {
      padding: 0.35rem 0.65rem;
      border-radius: var(--radius-sm);
      border: 1px solid var(--gc-border);
      font-size: 0.8rem;
      background: var(--gc-bg-secondary);
      color: var(--gc-text-secondary);
    }
    .map-chip.is-banned { opacity: 0.35; text-decoration: line-through; }
    .map-chip.is-picked { border-color: var(--gc-green); color: var(--gc-green); }
    .map-chip.is-available { border-color: var(--gc-border-light); }
    .map-ban-buttons { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .map-veto-actions { margin-top: 0.75rem; }
    .series-games { margin-top: 1rem; }
    .map-veto-deadline { margin-bottom: 0.5rem; }
    .map-veto-warning { color: var(--gc-red); margin-bottom: 0.5rem; }
    .map-veto-reopened { color: var(--gc-orange); margin-bottom: 0.5rem; }
    .map-veto-reopen { margin-bottom: 0.75rem; }
  `],
})
export class SeriesMapVetoComponent implements OnChanges {
  @Input() match: Match | null = null;
  @Input() series: SeriesVetoState | null = null;
  @Input() seriesMatches: { id: string; seriesGameNumber: number | null; map: string | null; status: string }[] = [];
  @Input() canAct = false;
  @Input() canAdminReopen = false;
  @Input() myCaptainTeamIds: string[] = [];
  @Output() seriesUpdated = new EventEmitter<void>();

  actionLoading = false;
  reopenLoading = false;
  actionError = '';
  getMapLabel = getMapLabel;

  constructor(private matchService: MatchService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['series'] && (this.series?.isStale || this.series?.deadlineExpired)) {
      this.refreshSeries();
    }
  }

  formatDeadline(value: string): string {
    return new Date(value).toLocaleString('pt-BR');
  }

  get availableMaps(): string[] {
    if (!this.series) return [];
    const banned = new Set(this.series.bannedMaps);
    const picked = new Set(this.series.pickedMaps);
    return this.series.mapPool.filter((m) => !banned.has(m) && !picked.has(m));
  }

  get availableForPick(): string[] {
    return this.availableMaps;
  }

  isAvailable(map: string): boolean {
    return this.availableMaps.includes(map);
  }

  isMyTurn(): boolean {
    return !!this.series?.vetoTurnTeamId && this.myCaptainTeamIds.includes(this.series.vetoTurnTeamId);
  }

  gameMatch(gameNumber: number) {
    return this.seriesMatches.find((m) => m.seriesGameNumber === gameNumber);
  }

  banMap(map: string): void {
    if (!this.series) return;
    this.actionLoading = true;
    this.actionError = '';
    this.matchService.seriesBanMap(this.series.seriesId, map).subscribe({
      next: () => {
        this.actionLoading = false;
        this.seriesUpdated.emit();
      },
      error: (err) => {
        this.actionError = err.error?.error || 'Erro ao banir mapa';
        this.actionLoading = false;
      },
    });
  }

  pickMap(map: string): void {
    if (!this.series) return;
    this.actionLoading = true;
    this.actionError = '';
    this.matchService.seriesPickMap(this.series.seriesId, map).subscribe({
      next: () => {
        this.actionLoading = false;
        this.seriesUpdated.emit();
      },
      error: (err) => {
        this.actionError = err.error?.error || 'Erro ao escolher mapa';
        this.actionLoading = false;
      },
    });
  }

  private refreshSeries(): void {
    if (!this.match) return;
    this.matchService.getMatchSeries(this.match.id).subscribe({
      next: () => this.seriesUpdated.emit(),
    });
  }

  reopenVeto(): void {
    if (!this.series) return;
    this.reopenLoading = true;
    this.actionError = '';
    this.matchService.reopenSeriesVeto(this.series.seriesId).subscribe({
      next: () => {
        this.reopenLoading = false;
        this.seriesUpdated.emit();
      },
      error: (err) => {
        this.actionError = err.error?.error || 'Erro ao reabrir veto.';
        this.reopenLoading = false;
      },
    });
  }
}
