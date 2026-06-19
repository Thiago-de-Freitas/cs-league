import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { AlertModalComponent } from '../alert-modal/alert-modal.component';
import { AlertConfig, NotificationService } from '../../Services/notification.service';

@Component({
  selector: 'app-notification-host',
  standalone: true,
  imports: [CommonModule, AlertModalComponent],
  template: `
    <app-alert-modal
      *ngIf="alert"
      [title]="alert.title || 'Aviso'"
      [message]="alert.message"
      [highlight]="alert.highlight || ''"
      [hint]="alert.hint || ''"
      [type]="alert.type || 'info'"
      [buttonLabel]="alert.buttonLabel || 'Entendi'"
      (closed)="onClose()">
    </app-alert-modal>
  `,
})
export class NotificationHostComponent implements OnInit, OnDestroy {
  alert: AlertConfig | null = null;
  private sub?: Subscription;

  constructor(private notifications: NotificationService) {}

  ngOnInit(): void {
    this.sub = this.notifications.alert$.subscribe((alert) => {
      this.alert = alert;
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  onClose(): void {
    this.notifications.dismiss();
  }
}
