import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MatchService } from './match.service';

describe('MatchService', () => {
  let service: MatchService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), MatchService],
    });
    service = TestBed.inject(MatchService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('getMatch chama GET do endpoint', () => {
    service.getMatch('match-1').subscribe();
    const req = httpMock.expectOne('/api/matches/match-1');
    expect(req.request.method).toBe('GET');
    req.flush({ id: 'match-1' });
  });

  it('registerResult envia placar', () => {
    service.registerResult('match-1', 13, 9, 'de_dust2').subscribe();
    const req = httpMock.expectOne('/api/matches/match-1/result');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ team1Rounds: 13, team2Rounds: 9, map: 'de_dust2' });
    req.flush({ id: 'match-1' });
  });

  it('reopenMapVeto chama POST reopen', () => {
    service.reopenMapVeto('match-1').subscribe();
    const req = httpMock.expectOne('/api/matches/match-1/map-veto/reopen');
    expect(req.request.method).toBe('POST');
    req.flush({ veto: null });
  });

  it('getMatchSeries chama endpoint de série', () => {
    service.getMatchSeries('match-1').subscribe();
    const req = httpMock.expectOne('/api/matches/match-1/series');
    expect(req.request.method).toBe('GET');
    req.flush({ id: 'series-1', matches: [] });
  });
});
