import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type AlertType = 'info' | 'warning' | 'error' | 'success';

export interface AlertConfig {
  title?: string;
  message: string;
  type?: AlertType;
  highlight?: string;
  hint?: string;
  buttonLabel?: string;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly alertSubject = new BehaviorSubject<AlertConfig | null>(null);
  readonly alert$ = this.alertSubject.asObservable();

  show(config: AlertConfig | string): void {
    if (typeof config === 'string') {
      this.alertSubject.next({ message: config, type: 'info', title: 'Aviso' });
      return;
    }
    this.alertSubject.next({
      type: 'info',
      title: 'Aviso',
      buttonLabel: 'Entendi',
      ...config,
    });
  }

  info(message: string, title = 'Informação', extra?: Partial<AlertConfig>): void {
    this.show({ message, title, type: 'info', ...extra });
  }

  warning(message: string, title = 'Atenção', extra?: Partial<AlertConfig>): void {
    this.show({ message, title, type: 'warning', ...extra });
  }

  error(message: string, title = 'Erro', extra?: Partial<AlertConfig>): void {
    this.show({ message, title, type: 'error', ...extra });
  }

  success(message: string, title = 'Sucesso', extra?: Partial<AlertConfig>): void {
    this.show({ message, title, type: 'success', ...extra });
  }

  dismiss(): void {
    this.alertSubject.next(null);
  }
}
