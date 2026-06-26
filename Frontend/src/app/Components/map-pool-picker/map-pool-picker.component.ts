import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CS2_MAPS, DEFAULT_MAP_POOL, getMapLabel } from '../../Utils/maps';

@Component({
  selector: 'app-map-pool-picker',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="map-pool-picker">
      <p class="form-hint" *ngIf="hint">{{ hint }}</p>
      <div class="map-pool-options">
        <label *ngFor="let map of allMaps" class="map-pool-option">
          <input
            type="checkbox"
            [checked]="selectedSet.has(map.value)"
            [disabled]="disabled"
            (change)="toggle(map.value, $event)">
          <span>{{ map.label }}</span>
        </label>
      </div>
      <p *ngIf="error" class="error-message">{{ error }}</p>
      <p class="form-hint">Mínimo 2 mapas. Padrão Valve: 7 mapas ativos.</p>
    </div>
  `,
  styles: [`
    .map-pool-options {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem 1rem;
      margin-top: 0.5rem;
    }
    .map-pool-option {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      font-family: var(--font-body);
      color: var(--gc-text-secondary);
      font-size: 0.875rem;
      cursor: pointer;
    }
    .map-pool-option input { accent-color: var(--gc-orange); }
  `],
})
export class MapPoolPickerComponent {
  @Input() selected: string[] = [...DEFAULT_MAP_POOL];
  @Input() disabled = false;
  @Input() hint = '';
  @Output() selectedChange = new EventEmitter<string[]>();

  allMaps = CS2_MAPS;
  error = '';

  get selectedSet(): Set<string> {
    return new Set(this.selected);
  }

  toggle(mapId: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    let next = [...this.selected];
    if (checked) {
      if (!next.includes(mapId)) next.push(mapId);
    } else {
      next = next.filter((m) => m !== mapId);
    }
    if (next.length < 2) {
      this.error = 'Selecione pelo menos 2 mapas.';
      (event.target as HTMLInputElement).checked = true;
      return;
    }
    this.error = '';
    this.selected = next;
    this.selectedChange.emit(next);
  }
}
