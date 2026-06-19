import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-confirm-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './confirm-modal.component.html',
  styleUrls: ['./confirm-modal.component.css'],
})
export class ConfirmModalComponent {
  @Input() title = 'Confirmar ação';
  @Input() subtitle = '';
  @Input() message = 'Deseja continuar?';
  @Input() highlight = '';
  @Input() highlightLabel = '';
  @Input() hint = '';
  @Input() confirmLabel = 'Confirmar';
  @Input() cancelLabel = 'Cancelar';
  @Input() danger = false;
  @Input() loading = false;
  @Output() confirmed = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  readonly titleId = `confirm-title-${Math.random().toString(36).slice(2, 9)}`;

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('gc-modal-backdrop')) {
      this.cancel();
    }
  }

  cancel(): void {
    if (!this.loading) {
      this.closed.emit();
    }
  }

  confirm(): void {
    if (!this.loading) {
      this.confirmed.emit();
    }
  }
}
