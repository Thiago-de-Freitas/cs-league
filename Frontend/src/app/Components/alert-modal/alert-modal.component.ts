import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AlertType } from '../../Services/notification.service';

@Component({
  selector: 'app-alert-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './alert-modal.component.html',
  styleUrls: ['./alert-modal.component.css'],
})
export class AlertModalComponent {
  @Input() title = 'Aviso';
  @Input() message = '';
  @Input() highlight = '';
  @Input() hint = '';
  @Input() type: AlertType = 'info';
  @Input() buttonLabel = 'Entendi';
  @Output() closed = new EventEmitter<void>();

  readonly titleId = `alert-title-${Math.random().toString(36).slice(2, 9)}`;

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('gc-modal-backdrop')) {
      this.close();
    }
  }

  close(): void {
    this.closed.emit();
  }
}
