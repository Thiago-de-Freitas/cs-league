import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { LeagueService } from './league.service';

describe('LeagueService', () => {
  let service: LeagueService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), LeagueService],
    });
    service = TestBed.inject(LeagueService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('getLeagues requests active leagues by default', () => {
    service.getLeagues().subscribe();
    const req = httpMock.expectOne('/api/leagues');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('getLeagues can include archived leagues', (done) => {
    service.getLeagues(true).subscribe((leagues) => {
      expect(leagues).toEqual([]);
      done();
    });
    const req = httpMock.expectOne('/api/leagues?includeArchived=true');
    req.flush([]);
  });

  it('deleteLeague calls DELETE endpoint', () => {
    service.deleteLeague('league-1').subscribe();
    const req = httpMock.expectOne('/api/leagues/league-1');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('archiveLeague calls POST archive endpoint', () => {
    service.archiveLeague('league-1').subscribe();
    const req = httpMock.expectOne('/api/leagues/league-1/archive');
    expect(req.request.method).toBe('POST');
    req.flush({ id: 'league-1', status: 'archived' });
  });

  it('getPickupState chama endpoint pickup', () => {
    service.getPickupState('league-1').subscribe();
    const req = httpMock.expectOne('/api/leagues/league-1/pickup');
    expect(req.request.method).toBe('GET');
    req.flush({ teamCount: 2, playersPerTeam: 5, balanceMode: 'rating', balanceModes: ['rating'], balancedAt: null, pool: [], squads: [] });
  });

  it('addPickupPlayer envia userId e teamId', () => {
    service.addPickupPlayer('league-1', 'user-1', 'team-1').subscribe();
    const req = httpMock.expectOne('/api/leagues/league-1/pickup/players');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ userId: 'user-1', teamId: 'team-1' });
    req.flush({ teamCount: 2, playersPerTeam: 5, balanceMode: 'rating', balanceModes: ['rating'], balancedAt: null, pool: [], squads: [] });
  });

  it('updatePickupSquads envia lista de squads', () => {
    const squads = [
      { id: 's1', name: 'Time 1', tag: 'T1' },
      { id: 's2', name: 'Time 2', tag: 'T2' },
    ];
    service.updatePickupSquads('league-1', squads).subscribe();
    const req = httpMock.expectOne('/api/leagues/league-1/pickup/squads');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ squads });
    req.flush({ teamCount: 2, playersPerTeam: 5, balanceMode: 'rating', balanceModes: ['rating'], balancedAt: null, pool: [], squads: [] });
  });

  it('balancePickupLeague envia critérios múltiplos', () => {
    service.balancePickupLeague('league-1', { playersPerTeam: 5, balanceModes: ['rating', 'adr'] }).subscribe();
    const req = httpMock.expectOne('/api/leagues/league-1/pickup/balance');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ playersPerTeam: 5, balanceModes: ['rating', 'adr'] });
    req.flush({ teamCount: 2, playersPerTeam: 5, balanceMode: 'rating', balanceModes: ['rating', 'adr'], balancedAt: null, pool: [], squads: [] });
  });

  it('startPickupMatch chama POST start', () => {
    service.startPickupMatch('league-1').subscribe();
    const req = httpMock.expectOne('/api/leagues/league-1/pickup/start');
    expect(req.request.method).toBe('POST');
    req.flush({
      matchId: 'match-1',
      seriesId: 'series-1',
      matchIds: ['match-1'],
      state: { teamCount: 2, playersPerTeam: 5, balanceMode: 'rating', balanceModes: ['rating'], balancedAt: null, pool: [], squads: [] },
    });
  });
});
