import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { Router } from '@angular/router';
import { AdminAuditComponent } from './admin-audit.component';
import { AuditService } from '../../Services/audit.service';
import { AuthService } from '../../Services/auth.service';

describe('AdminAuditComponent', () => {
  let component: AdminAuditComponent;
  let fixture: ComponentFixture<AdminAuditComponent>;
  let auditServiceSpy: jasmine.SpyObj<AuditService>;
  let authServiceSpy: jasmine.SpyObj<AuthService>;
  let routerSpy: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    auditServiceSpy = jasmine.createSpyObj('AuditService', ['getGlobalEvents']);
    authServiceSpy = jasmine.createSpyObj('AuthService', ['isSystemAdmin']);
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);

    authServiceSpy.isSystemAdmin.and.returnValue(true);
    auditServiceSpy.getGlobalEvents.and.returnValue(
      of({ events: [], page: 1, pageSize: 10, total: 25, totalPages: 3 })
    );

    await TestBed.configureTestingModule({
      imports: [AdminAuditComponent],
      providers: [
        { provide: AuditService, useValue: auditServiceSpy },
        { provide: AuthService, useValue: authServiceSpy },
        { provide: Router, useValue: routerSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminAuditComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('redireciona usuários não admin', () => {
    authServiceSpy.isSystemAdmin.and.returnValue(false);
    component.ngOnInit();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('carrega eventos com paginação padrão', () => {
    expect(auditServiceSpy.getGlobalEvents).toHaveBeenCalledWith({
      page: 1,
      pageSize: 10,
      action: undefined,
      entityType: undefined,
    });
    expect(component.total).toBe(25);
    expect(component.totalPages).toBe(3);
  });

  it('rangeLabel mostra intervalo atual', () => {
    component.page = 2;
    component.pageSize = 10;
    component.total = 25;
    expect(component.rangeLabel).toBe('11–20 de 25');
  });

  it('applyFilters reseta para página 1', () => {
    component.page = 3;
    component.actionFilter = 'league.create';
    component.applyFilters();
    expect(component.page).toBe(1);
    expect(auditServiceSpy.getGlobalEvents).toHaveBeenCalled();
  });

  it('goToPage ignora páginas inválidas', () => {
    const callsBefore = auditServiceSpy.getGlobalEvents.calls.count();
    component.goToPage(0);
    component.goToPage(99);
    expect(auditServiceSpy.getGlobalEvents.calls.count()).toBe(callsBefore);
  });

  it('goToPage carrega nova página', () => {
    auditServiceSpy.getGlobalEvents.and.callFake((opts = {}) =>
      of({ events: [], page: opts.page ?? 1, pageSize: opts.pageSize ?? 10, total: 25, totalPages: 3 })
    );
    component.goToPage(2);
    expect(component.page).toBe(2);
    expect(auditServiceSpy.getGlobalEvents).toHaveBeenCalledWith(
      jasmine.objectContaining({ page: 2, pageSize: 10 })
    );
  });

  it('onPageSizeChange reseta página e recarrega', () => {
    component.page = 2;
    component.pageSize = 50;
    component.onPageSizeChange();
    expect(component.page).toBe(1);
    expect(auditServiceSpy.getGlobalEvents).toHaveBeenCalledWith(
      jasmine.objectContaining({ page: 1, pageSize: 50 })
    );
  });

  it('formatAction substitui pontos por separador', () => {
    expect(component.formatAction('league.create')).toBe('league · create');
  });
});
