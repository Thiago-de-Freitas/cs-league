import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TeamService } from './team.service';

describe('TeamService', () => {
  let service: TeamService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), TeamService],
    });
    service = TestBed.inject(TeamService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('createTeam sends ownerAsMember true by default', () => {
    service.createTeam('FURIA', 'FUR').subscribe();

    const req = httpMock.expectOne('/api/teams');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      name: 'FURIA',
      tag: 'FUR',
      ownerAsMember: true,
    });
    req.flush({ id: 't1', name: 'FURIA', tag: 'FUR', players: [] });
  });

  it('createTeam can omit owner from roster', () => {
    service.createTeam('Org Team', 'ORG', { ownerAsMember: false }).subscribe();

    const req = httpMock.expectOne('/api/teams');
    expect(req.request.body.ownerAsMember).toBeFalse();
    req.flush({ id: 't2', name: 'Org Team', tag: 'ORG', players: [] });
  });

  it('getTeams caches the response', (done) => {
    service.getTeams().subscribe((first) => {
      expect(first).toEqual([]);
      service.getTeams().subscribe((second) => {
        expect(second).toEqual([]);
        done();
      });
    });

    const req = httpMock.expectOne('/api/teams');
    req.flush([]);
    httpMock.expectNone('/api/teams');
  });

  it('deleteTeam invalidates cache', (done) => {
    service.getTeams().subscribe();
    httpMock.expectOne('/api/teams').flush([]);

    service.deleteTeam('t1').subscribe({
      next: () => {
        service.getTeams().subscribe((teams) => {
          expect(teams).toEqual([]);
          done();
        });
        httpMock.expectOne('/api/teams').flush([]);
      },
    });
    httpMock.expectOne('/api/teams/t1').flush(null);
  });
});
