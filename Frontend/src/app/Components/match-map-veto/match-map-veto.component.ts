import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatchService } from '../../Services/match.service';
import { MapVetoState, Match } from '../../Models/interfaces';
import { getMapLabel } from '../../Utils/maps';

@Component({
  selector: 'app-match-map-veto',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="gc-card map-veto-card" *ngIf="enabled && veto">
      <h2 class="section-title">Veto de mapas (estilo Valve)</h2>
      <p class="meta map-veto-intro" *ngIf="veto.status === 'ban_phase'">
        Capitães alternam bans até restar um mapa. Se não agir em 15 min, o sistema sorteia.
      </p>
      <p class="meta map-veto-intro" *ngIf="veto.status === 'side_phase'">
        Escolha se seu time começa como <strong>CT</strong> ou <strong>T</strong> no mapa decidido.
      </p>
      <p class="meta map-veto-intro" *ngIf="veto.status === 'completed'">
        Veto concluído<span *ngIf="veto.autoResolved"> (ações automáticas por tempo esgotado)</span>.
      </p>

      <div class="map-pool-grid">
        <span
          *ngFor="let map of veto.mapPool"
          class="map-chip"
          [class.is-banned]="veto.bannedMaps.includes(map)"
          [class.is-selected]="veto.selectedMap === map"
          [class.is-available]="isAvailable(map)">
          {{ getMapLabel(map) }}
        </span>
      </div>

      <p class="meta" *ngIf="veto.selectedMap">
        Mapa: <strong>{{ getMapLabel(veto.selectedMap) }}</strong>
        <span *ngIf="match?.team1StartingSide"> · {{ match!.team1!.name }}: {{ match!.team1StartingSide | uppercase }}</span>
        <span *ngIf="match?.team2StartingSide"> · {{ match!.team2!.name }}: {{ match!.team2StartingSide | uppercase }}</span>
      </p>

      <div class="map-veto-actions" *ngIf="canAct && veto.status === 'ban_phase' && isMyBanTurn()">
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

      <div class="map-veto-actions" *ngIf="canAct && veto.status === 'side_phase' && isMySideTurn()">
        <p class="form-label">Escolha o lado inicial do seu time</p>
        <button type="button" class="btn btn-primary btn-small" [disabled]="actionLoading" (click)="pickSide('CT')">Começar CT</button>
        <button type="button" class="btn btn-secondary btn-small" [disabled]="actionLoading" (click)="pickSide('T')">Começar T</button>
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
    .map-chip.is-selected { border-color: var(--gc-orange); color: var(--gc-orange); background: var(--gc-orange-dim); }
    .map-chip.is-available { border-color: var(--gc-border-light); }
    .map-ban-buttons { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .map-veto-actions { margin-top: 0.75rem; }
  `],
})
export class MatchMapVetoComponent implements OnChanges {
  @Input() match: Match | null = null;
  @Input() veto: MapVetoState | null = null;
  @Input() enabled = false;
  @Input() canAct = false;
  @Input() myCaptainTeamIds: string[] = [];
  @Output() vetoUpdated = new EventEmitter<MapVetoState>();

  actionLoading = false;
  actionError = '';
  getMapLabel = getMapLabel;

  constructor(private matchService: MatchService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['veto'] && this.veto?.isStale && this.enabled) {
      this.refreshVeto();
    }
  }

  get availableMaps(): string[] {
    if (!this.veto) return [];
    const banned = new Set(this.veto.bannedMaps);
    return this.veto.mapPool.filter((m) => !banned.has(m));
  }

  isAvailable(map: string): boolean {
    return this.availableMaps.includes(map);
  }

  isMyBanTurn(): boolean {
    return !!this.veto?.vetoTurnTeamId && this.myCaptainTeamIds.includes(this.veto.vetoTurnTeamId);
  }

  isMySideTurn(): boolean {
    return !!this.veto?.sidePickTeamId && this.myCaptainTeamIds.includes(this.veto.sidePickTeamId);
  }

  banMap(map: string): void {
    if (!this.match) return;
    this.actionLoading = true;
    this.actionError = '';
    this.matchService.banMap(this.match.id, map).subscribe({
      next: (res) => {
        this.veto = res.veto;
        this.vetoUpdated.emit(res.veto);
        this.actionLoading = false;
      },
      error: (err) => {
        this.actionError = err.error?.error || 'Erro ao banir mapa';
        this.actionLoading = false;
      },
    });
  }

  pickSide(side: 'CT' | 'T'): void {
    if (!this.match) return;
    this.actionLoading = true;
    this.actionError = '';
    this.matchService.pickSide(this.match.id, side).subscribe({
      next: (res) => {
        this.veto = res.veto;
        this.vetoUpdated.emit(res.veto);
        this.actionLoading = false;
      },
      error: (err) => {
        this.actionError = err.error?.error || 'Erro ao escolher lado';
        this.actionLoading = false;
      },
    });
  }

  private refreshVeto(): void {
    if (!this.match) return;
    this.matchService.getMapVeto(this.match.id).subscribe({
      next: (res) => {
        if (res.veto) {
          this.veto = res.veto;
          this.vetoUpdated.emit(res.veto);
        }
      },
    });
  }
}
