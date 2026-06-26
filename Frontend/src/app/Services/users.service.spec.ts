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
    service.listUsers({ page: 2, pageSize: 20, q: 'allan', position: 'AWP', role: 'USER' }).subscribe(() => done());
    const req = httpMock.expectOne((r) => r.url === '/api/users');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('limit')).toBe('20');
    expect(req.request.params.get('q')).toBe('allan');
    expect(req.request.params.get('position')).toBe('AWP');
    expect(req.request.params.get('role')).toBe('USER');
    req.flush({ users: [], page: 2, pageSize: 20, total: 0, totalPages: 1 });
  });
});
