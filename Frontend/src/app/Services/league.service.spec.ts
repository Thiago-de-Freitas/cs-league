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
});
