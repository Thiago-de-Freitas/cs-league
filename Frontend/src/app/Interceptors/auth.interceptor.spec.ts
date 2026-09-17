import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { AuthService } from '../Services/auth.service';
import { authInterceptor, isCredentialCheckRequest } from './auth.interceptor';

describe('authInterceptor (padrão Igreja 4.0)', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let authMock: { token: string | null; logout: jasmine.Spy };
  let routerMock: { navigate: jasmine.Spy };

  beforeEach(() => {
    authMock = { token: 'jwt-test', logout: jasmine.createSpy('logout') };
    routerMock = { navigate: jasmine.createSpy('navigate') };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: authMock },
        { provide: Router, useValue: routerMock },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('anexa Authorization Bearer quando há token', () => {
    http.get('/api/leagues').subscribe();
    const req = httpMock.expectOne('/api/leagues');
    expect(req.request.headers.get('Authorization')).toBe('Bearer jwt-test');
    req.flush([]);
  });

  it('nunca coloca JWT na query string (só Bearer no header)', () => {
    http.get('/api/leagues', { params: { includeArchived: 'true' } }).subscribe();
    const req = httpMock.expectOne((r) => r.url.startsWith('/api/leagues'));
    expect(req.request.headers.get('Authorization')).toBe('Bearer jwt-test');
    expect(req.request.params.get('token')).toBeNull();
    expect(req.request.params.get('access_token')).toBeNull();
    req.flush([]);
  });

  it('segue sem header quando não há token', () => {
    authMock.token = null;
    http.get('/api/leagues/open').subscribe();
    const req = httpMock.expectOne('/api/leagues/open');
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush([]);
  });

  it('401 em /api/auth/my-leagues não limpa a sessão', () => {
    http.post('/api/auth/my-leagues', { email: 'a@b.com', password: 'secret1' }).subscribe({
      error: (err) => expect(err.status).toBe(401),
    });
    const req = httpMock.expectOne('/api/auth/my-leagues');
    req.flush({ error: 'Credenciais inválidas' }, { status: 401, statusText: 'Unauthorized' });
    expect(authMock.logout).not.toHaveBeenCalled();
    expect(routerMock.navigate).not.toHaveBeenCalled();
  });

  it('401 em rota autenticada faz logout e manda para /login', () => {
    http.get('/api/leagues/mine').subscribe({
      error: (err) => expect(err.status).toBe(401),
    });
    const req = httpMock.expectOne('/api/leagues/mine');
    req.flush({ error: 'Não autenticado' }, { status: 401, statusText: 'Unauthorized' });
    expect(authMock.logout).toHaveBeenCalled();
    expect(routerMock.navigate).toHaveBeenCalledWith(['/login']);
  });
});

describe('isCredentialCheckRequest', () => {
  it('reconhece login, register e my-leagues como checagem de credencial', () => {
    expect(isCredentialCheckRequest('/api/auth/login')).toBeTrue();
    expect(isCredentialCheckRequest('/api/auth/register')).toBeTrue();
    expect(isCredentialCheckRequest('/api/auth/my-leagues')).toBeTrue();
    expect(isCredentialCheckRequest('/api/leagues')).toBeFalse();
    expect(isCredentialCheckRequest('/api/auth/me')).toBeFalse();
  });
});
