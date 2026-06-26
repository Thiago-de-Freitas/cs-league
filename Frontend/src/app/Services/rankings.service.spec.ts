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
    service.getPlayerRankings().subscribe((page) => {
      expect(page.players).toEqual([]);
      done();
    });
    const req = httpMock.expectOne('/api/rankings/players?page=1&limit=10');
    req.flush({ players: [], page: 1, pageSize: 10, total: 0, totalPages: 1 });
  });

  it('getPlayerRankings can filter by league', (done) => {
    service.getPlayerRankings({ leagueId: 'league-1' }).subscribe((page) => {
      expect(page.players).toEqual([]);
      done();
    });
    const req = httpMock.expectOne('/api/rankings/players?page=1&limit=10&leagueId=league-1');
    req.flush({ players: [], page: 1, pageSize: 10, total: 0, totalPages: 1 });
  });

  it('getPlayerRankings can filter by position', (done) => {
    service.getPlayerRankings({ position: 'AWP' }).subscribe((page) => {
      expect(page.players).toEqual([]);
      done();
    });
    const req = httpMock.expectOne('/api/rankings/players?page=1&limit=10&position=AWP');
    req.flush({ players: [], page: 1, pageSize: 10, total: 0, totalPages: 1 });
  });

  it('getPlayerRankings can paginate', (done) => {
    service.getPlayerRankings({ page: 2, pageSize: 20 }).subscribe((page) => {
      expect(page.page).toBe(2);
      expect(page.pageSize).toBe(20);
      done();
    });
    const req = httpMock.expectOne('/api/rankings/players?page=2&limit=20');
    req.flush({ players: [], page: 2, pageSize: 20, total: 0, totalPages: 1 });
  });

  it('getPlayerRankings can include personal demos', (done) => {
    service.getPlayerRankings({ includePersonal: true }).subscribe((page) => {
      expect(page.players).toEqual([]);
      done();
    });
    const req = httpMock.expectOne('/api/rankings/players?page=1&limit=10&includePersonal=true');
    req.flush({ players: [], page: 1, pageSize: 10, total: 0, totalPages: 1 });
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
