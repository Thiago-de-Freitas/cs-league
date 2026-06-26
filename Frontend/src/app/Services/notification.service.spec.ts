import { TestBed } from '@angular/core/testing';
import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  let service: NotificationService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [NotificationService],
    });
    service = TestBed.inject(NotificationService);
  });

  it('info emite alerta com tipo info', (done) => {
    service.alert$.subscribe((alert) => {
      if (!alert) return;
      expect(alert.type).toBe('info');
      expect(alert.message).toBe('Mensagem informativa');
      done();
    });
    service.info('Mensagem informativa');
  });

  it('success emite alerta com tipo success', (done) => {
    service.alert$.subscribe((alert) => {
      if (!alert) return;
      expect(alert.type).toBe('success');
      expect(alert.message).toBe('Operação concluída');
      done();
    });
    service.success('Operação concluída');
  });

  it('dismiss limpa o alerta', () => {
    const values: (import('./notification.service').AlertConfig | null)[] = [];
    const sub = service.alert$.subscribe((alert) => values.push(alert));
    service.error('Falha');
    service.dismiss();
    expect(values[values.length - 1]).toBeNull();
    sub.unsubscribe();
  });
});
