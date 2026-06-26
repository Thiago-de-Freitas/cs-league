import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuditService } from './audit.service';

describe('AuditService', () => {
  let service: AuditService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), AuditService],
    });
    service = TestBed.inject(AuditService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('getGlobalEvents usa paginação padrão', (done) => {
    service.getGlobalEvents().subscribe((page) => {
      expect(page.events).toEqual([]);
      expect(page.page).toBe(1);
      done();
    });
    const req = httpMock.expectOne('/api/audit/events?page=1&limit=10');
    expect(req.request.method).toBe('GET');
    req.flush({ events: [], page: 1, pageSize: 10, total: 0, totalPages: 1 });
  });

  it('getGlobalEvents envia pageSize e filtros', (done) => {
    service
      .getGlobalEvents({
        page: 2,
        pageSize: 50,
        action: 'league.create',
        entityType: 'league',
        entityId: 'l1',
        actorUserId: 'u1',
        from: '2025-01-01',
        to: '2025-12-31',
      })
      .subscribe((page) => {
        expect(page.pageSize).toBe(50);
        done();
      });
    const req = httpMock.expectOne((r) => r.url === '/api/audit/events');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('limit')).toBe('50');
    expect(req.request.params.get('action')).toBe('league.create');
    expect(req.request.params.get('entityType')).toBe('league');
    expect(req.request.params.get('entityId')).toBe('l1');
    expect(req.request.params.get('actorUserId')).toBe('u1');
    expect(req.request.params.get('from')).toBe('2025-01-01');
    expect(req.request.params.get('to')).toBe('2025-12-31');
    req.flush({ events: [], page: 2, pageSize: 50, total: 0, totalPages: 1 });
  });

  it('getLeagueActivity envia limit e cursor', (done) => {
    service.getLeagueActivity('league-1', 20, 'cursor-abc').subscribe((page) => {
      expect(page.events).toEqual([]);
      done();
    });
    const req = httpMock.expectOne('/api/audit/leagues/league-1/activity?limit=20&cursor=cursor-abc');
    req.flush({ events: [], nextCursor: null });
  });
});
