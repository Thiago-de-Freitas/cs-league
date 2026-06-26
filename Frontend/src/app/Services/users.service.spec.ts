import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), UsersService],
    });
    service = TestBed.inject(UsersService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('listUsers usa paginação padrão', (done) => {
    service.listUsers().subscribe((page) => {
      expect(page.users).toEqual([]);
      expect(page.page).toBe(1);
      done();
    });
    const req = httpMock.expectOne('/api/users?page=1&limit=10');
    expect(req.request.method).toBe('GET');
    req.flush({ users: [], page: 1, pageSize: 10, total: 0, totalPages: 1 });
  });

  it('listUsers envia busca e filtros', (done) => {
    service.listUsers({ page: 2, pageSize: 20, q: 'allan', position: 'AWP', role: 'USER', status: 'banned' }).subscribe(() => done());
    const req = httpMock.expectOne((r) => r.url === '/api/users');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('limit')).toBe('20');
    expect(req.request.params.get('q')).toBe('allan');
    expect(req.request.params.get('position')).toBe('AWP');
    expect(req.request.params.get('role')).toBe('USER');
    expect(req.request.params.get('status')).toBe('banned');
    req.flush({ users: [], page: 2, pageSize: 20, total: 0, totalPages: 1 });
  });

  it('banUser envia dias no corpo', (done) => {
    service.banUser('u1', 14).subscribe(() => done());
    const req = httpMock.expectOne('/api/users/u1/ban');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ days: 14 });
    req.flush({ user: { id: 'u1' } });
  });

  it('getUserProfile consulta endpoint público', (done) => {
    service.getUserProfile('u1').subscribe((profile) => {
      expect(profile.id).toBe('u1');
      done();
    });
    const req = httpMock.expectOne('/api/users/u1/profile');
    expect(req.request.method).toBe('GET');
    req.flush({
      id: 'u1',
      displayName: 'Player',
      teams: [],
      leagueStats: null,
      personalStats: {
        summary: { demosTotal: 1, demosCompleted: 1, kills: 10, deaths: 5, kd: 2, adr: 80, hsPercent: 40, kast: 70, rating: 1 },
        demos: [],
      },
      isSelf: false,
    });
  });
});
