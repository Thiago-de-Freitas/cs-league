import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from './auth.service';
import { TeamService } from './team.service';
import { LeagueService } from './league.service';
import { RankingsService } from './rankings.service';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        AuthService,
        TeamService,
        LeagueService,
        RankingsService,
      ],
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('login stores session and exposes admin helpers', () => {
    service.login('admin@cslegue.com', 'secret').subscribe();

    const req = httpMock.expectOne('/api/auth/login');
    expect(req.request.method).toBe('POST');
    req.flush({
      token: 'jwt-token',
      user: {
        id: 'u1',
        email: 'admin@cslegue.com',
        displayName: 'Admin',
        role: 'ADMIN',
      },
    });

    expect(service.isLoggedIn).toBeTrue();
    expect(service.isSystemAdmin()).toBeTrue();
    expect(service.isLeagueOwner('other-owner')).toBeTrue();
    expect(service.isTeamOwner('other-owner')).toBeTrue();
  });

  it('canManageTeam allows owner and members', () => {
    service.login('user@test.com', 'pass').subscribe();
    httpMock.expectOne('/api/auth/login').flush({
      token: 'jwt',
      user: { id: 'u1', email: 'user@test.com', displayName: 'User', role: 'USER' },
    });

    expect(service.canManageTeam({ ownerId: 'u1', players: [] })).toBeTrue();
    expect(service.canManageTeam({ ownerId: 'other', players: [{ id: 'u1' }] })).toBeTrue();
    expect(service.canManageTeam({ ownerId: 'other', players: [{ id: 'u2' }] })).toBeFalse();
  });

  it('getMyLeaguesSnapshot envia email e senha sem gravar sessão', (done) => {
    service.getMyLeaguesSnapshot('user@test.com', 'secret').subscribe((snapshot) => {
      expect(service.isLoggedIn).toBeFalse();
      expect(snapshot.managed.length).toBe(1);
      expect(snapshot.participating).toEqual([]);
      expect(snapshot.user.email).toBe('user@test.com');
      done();
    });

    const req = httpMock.expectOne('/api/auth/my-leagues');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'user@test.com', password: 'secret' });
    req.flush({
      user: { id: 'u1', email: 'user@test.com', displayName: 'User', role: 'USER' },
      managed: [{ id: 'l1', name: 'Liga gerida', description: '', teams: [], status: 'ongoing' }],
      participating: [],
    });
  });

  it('logout clears session', () => {
    localStorage.setItem('cs_league_token', 'jwt');
    localStorage.setItem('cs_league_user', JSON.stringify({ id: 'u1', role: 'USER' }));

    service.logout();

    expect(service.isLoggedIn).toBeFalse();
    expect(service.currentUser).toBeNull();
  });
});
