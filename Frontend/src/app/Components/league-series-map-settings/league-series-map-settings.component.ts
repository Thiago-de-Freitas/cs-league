import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MapPoolPickerComponent } from '../map-pool-picker/map-pool-picker.component';
import { DEFAULT_MAP_POOL } from '../../Utils/maps';
import {
  getMapPoolHint,
  getVetoFlowDescription,
  getVetoSteps,
  shouldShowMapPool,
  validateLeagueMapSettings,
  type LeagueSeriesFormat,
} from '../../Utils/series-map.util';

export type { LeagueSeriesFormat };

@Component({
  selector: 'app-league-series-map-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, MapPoolPickerComponent],
  template: `
    <div class="series-map-settings">
      <div class="form-group">
        <span class="form-label">Como definir o vencedor do confronto</span>
        <div class="series-format-options" role="radiogroup" [attr.aria-label]="'Formato para definir vencedor'">
          <label class="series-format-option" [class.is-selected]="seriesFormat === 'bo1'">
            <input
              type="radio"
              name="seriesFormat"
              value="bo1"
              [checked]="seriesFormat === 'bo1'"
              [disabled]="disabled"
              (change)="onFormatChange('bo1')">
            <span class="series-format-option-body">
              <strong>1 mapa (BO1)</strong>
              <span class="series-format-option-desc">Vence quem ganhar o mapa único.</span>
            </span>
          </label>
          <label class="series-format-option" [class.is-selected]="seriesFormat === 'bo3'">
            <input
              type="radio"
              name="seriesFormat"
              value="bo3"
              [checked]="seriesFormat === 'bo3'"
              [disabled]="disabled"
              (change)="onFormatChange('bo3')">
            <span class="series-format-option-body">
              <strong>Melhor de 3 (BO3)</strong>
              <span class="series-format-option-desc">Vence quem ganhar 2 mapas.</span>
            </span>
          </label>
        </div>
        <p class="form-hint" *ngIf="scopeHint">{{ scopeHint }}</p>
      </div>

      <div class="gc-card series-veto-info">
        <h3 class="series-veto-info-title">Seleção de mapas</h3>
        <p class="series-veto-info-text">{{ vetoFlowDescription }}</p>
        <ul class="series-veto-steps" *ngIf="vetoSteps.length">
          <li *ngFor="let step of vetoSteps">{{ step }}</li>
        </ul>
      </div>

      <div class="form-group" *ngIf="seriesFormat === 'bo1'">
        <label class="form-label checkbox-label">
          <input
            type="checkbox"
            [checked]="mapVetoEnabled"
            [disabled]="disabled"
            (change)="onVetoToggle($event)">
          Veto de mapas entre capitães (estilo Valve)
        </label>
        <p class="form-hint" *ngIf="!mapVetoEnabled">
          Sem veto: o mapa pode ser informado manualmente ao registrar o resultado.
        </p>
      </div>

      <div class="form-group" *ngIf="showMapPool">
        <label class="form-label">Map pool</label>
        <app-map-pool-picker
          [selected]="mapPool"
          [disabled]="disabled"
          [hint]="mapPoolHint"
          (selectedChange)="onMapPoolChange($event)">
        </app-map-pool-picker>
      </div>

      <p *ngIf="validationError" class="error-message">{{ validationError }}</p>
    </div>
  `,
  styles: [`
    .series-format-options {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin-top: 0.5rem;
    }
    .series-format-option {
      display: flex;
      align-items: flex-start;
      gap: 0.65rem;
      padding: 0.75rem 1rem;
      border: 1px solid var(--gc-border);
      border-radius: var(--radius-md);
      background: var(--gc-bg-secondary);
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s;
    }
    .series-format-option.is-selected {
      border-color: var(--gc-orange);
      background: var(--gc-orange-dim);
    }
    .series-format-option input { accent-color: var(--gc-orange); margin-top: 0.2rem; }
    .series-format-option-body { display: flex; flex-direction: column; gap: 0.2rem; }
    .series-format-option-body strong {
      font-family: var(--font-display);
      font-size: 0.85rem;
      text-transform: uppercase;
      color: var(--gc-text);
    }
    .series-format-option-desc {
      font-size: 0.85rem;
      color: var(--gc-text-secondary);
      font-family: var(--font-body);
    }
    .series-veto-info {
      padding: 1rem;
      margin: 1rem 0;
      background: var(--gc-surface);
    }
    .series-veto-info-title {
      margin: 0 0 0.5rem;
      font-family: var(--font-display);
      font-size: 0.8rem;
      text-transform: uppercase;
      color: var(--gc-orange);
    }
    .series-veto-info-text {
      margin: 0 0 0.5rem;
      font-size: 0.875rem;
      color: var(--gc-text-secondary);
      font-family: var(--font-body);
    }
    .series-veto-steps {
      margin: 0;
      padding-left: 1.2rem;
      font-size: 0.85rem;
      color: var(--gc-text-secondary);
    }
    .series-veto-steps li { margin-bottom: 0.25rem; }
  `],
})
export class LeagueSeriesMapSettingsComponent {
  @Input() seriesFormat: LeagueSeriesFormat = 'bo1';
  @Input() mapPool: string[] = [...DEFAULT_MAP_POOL];
  @Input() mapVetoEnabled = true;
  @Input() disabled = false;
  @Input() scopeHint = '';

  @Output() seriesFormatChange = new EventEmitter<LeagueSeriesFormat>();
  @Output() mapPoolChange = new EventEmitter<string[]>();
  @Output() mapVetoEnabledChange = new EventEmitter<boolean>();

  validationError = '';

  get showMapPool(): boolean {
    return shouldShowMapPool(this.seriesFormat, this.mapVetoEnabled);
  }

  get mapPoolHint(): string {
    return getMapPoolHint(this.seriesFormat);
  }

  get vetoFlowDescription(): string {
    return getVetoFlowDescription(this.seriesFormat, this.mapVetoEnabled);
  }

  get vetoSteps(): string[] {
    return getVetoSteps(this.seriesFormat, this.mapVetoEnabled);
  }

  onFormatChange(format: LeagueSeriesFormat): void {
    this.validationError = '';
    this.seriesFormatChange.emit(format);
    if (format === 'bo3') {
      this.mapVetoEnabledChange.emit(true);
      if (this.mapPool.length < 5) {
        this.mapPoolChange.emit([...DEFAULT_MAP_POOL]);
      }
    }
  }

  onVetoToggle(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.mapVetoEnabledChange.emit(checked);
    this.validationError = '';
  }

  onMapPoolChange(pool: string[]): void {
    this.mapPoolChange.emit(pool);
    this.validate(pool);
  }

  validate(pool = this.mapPool): boolean {
    const error = validateLeagueMapSettings(pool, this.seriesFormat);
    this.validationError = error ?? '';
    return !error;
  }
}
