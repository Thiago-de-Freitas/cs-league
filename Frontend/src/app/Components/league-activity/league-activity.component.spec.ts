import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { LeagueActivityComponent } from './league-activity.component';
import { AuditService } from '../../Services/audit.service';
import { AuditEvent } from '../../Models/interfaces';

describe('LeagueActivityComponent', () => {
  let component: LeagueActivityComponent;
  let fixture: ComponentFixture<LeagueActivityComponent>;
  let auditServiceSpy: jasmine.SpyObj<AuditService>;

  const event: AuditEvent = {
    id: 'e1',
    occurredAt: '2025-06-01T12:00:00Z',
    action: 'league.create',
    entityType: 'league',
    entityId: 'l1',
    actorType: 'user',
    actorLabel: 'Admin',
    success: true,
  };

  beforeEach(async () => {
    auditServiceSpy = jasmine.createSpyObj('AuditService', ['getLeagueActivity']);
    auditServiceSpy.getLeagueActivity.and.returnValue(
      of({ events: [event], nextCursor: 'cursor-2' })
    );

    await TestBed.configureTestingModule({
      imports: [LeagueActivityComponent],
      providers: [{ provide: AuditService, useValue: auditServiceSpy }],
    }).compileComponents();

    fixture = TestBed.createComponent(LeagueActivityComponent);
    component = fixture.componentInstance;
    component.leagueId = 'league-1';
    fixture.detectChanges();
  });

  it('carrega atividade da liga', () => {
    expect(auditServiceSpy.getLeagueActivity).toHaveBeenCalledWith('league-1');
    expect(component.events.length).toBe(1);
    expect(component.nextCursor).toBe('cursor-2');
  });

  it('loadMore anexa eventos com cursor', () => {
    const more: AuditEvent = { ...event, id: 'e2', action: 'league.update' };
    auditServiceSpy.getLeagueActivity.and.returnValue(
      of({ events: [more], nextCursor: null })
    );
    component.loadMore();
    expect(auditServiceSpy.getLeagueActivity).toHaveBeenCalledWith('league-1', 50, 'cursor-2');
    expect(component.events.length).toBe(2);
    expect(component.nextCursor).toBeNull();
  });

  it('loadMore não faz nada sem cursor', () => {
    component.nextCursor = null;
    const callsBefore = auditServiceSpy.getLeagueActivity.calls.count();
    component.loadMore();
    expect(auditServiceSpy.getLeagueActivity.calls.count()).toBe(callsBefore);
  });

  it('formatAction usa rótulos conhecidos', () => {
    expect(component.formatAction('league.create')).toBe('Liga criada');
    expect(component.formatAction('custom.action')).toBe('custom · action');
  });

  it('toggleDetails expande e recolhe', () => {
    expect(component.isExpanded('e1')).toBeFalse();
    component.toggleDetails('e1');
    expect(component.isExpanded('e1')).toBeTrue();
    component.toggleDetails('e1');
    expect(component.isExpanded('e1')).toBeFalse();
  });

  it('formatActor prioriza actorLabel', () => {
    expect(component.formatActor(event)).toBe('Admin');
    expect(component.formatActor({ ...event, actorLabel: undefined, actorType: 'system' })).toBe('Sistema');
  });
});
