import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RankingsService } from './rankings.service';

describe('RankingsService', () => {
  let service: RankingsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), RankingsService],
    });
    service = TestBed.inject(RankingsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('getPlayerRankings requests default endpoint', (done) => {
    service.getPlayerRankings().subscribe((rows) => {
      expect(rows).toEqual([]);
      done();
    });
    const req = httpMock.expectOne('/api/rankings/players');
    req.flush([]);
  });

  it('getPlayerRankings can filter by league', (done) => {
    service.getPlayerRankings('league-1').subscribe((rows) => {
      expect(rows).toEqual([]);
      done();
    });
    const req = httpMock.expectOne('/api/rankings/players?leagueId=league-1');
    req.flush([]);
  });

  it('getTeamRankings requests team ranking endpoint', (done) => {
    service.getTeamRankings().subscribe((rows) => {
      expect(rows).toEqual([]);
      done();
    });
    const req = httpMock.expectOne('/api/rankings/teams');
    req.flush([]);
  });
});
