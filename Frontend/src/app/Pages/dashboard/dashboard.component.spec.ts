import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { Router } from '@angular/router';
import { DashboardComponent } from './dashboard.component';
import { LeagueService } from '../../Services/league.service';
import { TeamService } from '../../Services/team.service';
import { RankingsService } from '../../Services/rankings.service';
import { AuthService } from '../../Services/auth.service';

describe('DashboardComponent', () => {
  let component: DashboardComponent;
  let fixture: ComponentFixture<DashboardComponent>;
  let rankingsServiceSpy: jasmine.SpyObj<RankingsService>;
  let leagueServiceSpy: jasmine.SpyObj<LeagueService>;
  let teamServiceSpy: jasmine.SpyObj<TeamService>;
  let authServiceSpy: jasmine.SpyObj<AuthService>;

  beforeEach(async () => {
    rankingsServiceSpy = jasmine.createSpyObj('RankingsService', ['getPlayerRankings', 'getTeamRankings']);
    leagueServiceSpy = jasmine.createSpyObj('LeagueService', ['getLeagues', 'getOpenLeagues']);
    teamServiceSpy = jasmine.createSpyObj('TeamService', ['getTeams', 'getPendingInvites']);
    authServiceSpy = jasmine.createSpyObj('AuthService', [], { currentUser$: of({ displayName: 'Tester' }) });

    leagueServiceSpy.getLeagues.and.returnValue(of([]));
    leagueServiceSpy.getOpenLeagues.and.returnValue(of([]));
    teamServiceSpy.getTeams.and.returnValue(of([]));
    teamServiceSpy.getPendingInvites.and.returnValue(of([]));
    rankingsServiceSpy.getPlayerRankings.and.returnValue(
      of({ players: [], page: 1, pageSize: 10, total: 42, totalPages: 5 })
    );
    rankingsServiceSpy.getTeamRankings.and.returnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        { provide: LeagueService, useValue: leagueServiceSpy },
        { provide: TeamService, useValue: teamServiceSpy },
        { provide: RankingsService, useValue: rankingsServiceSpy },
        { provide: AuthService, useValue: authServiceSpy },
        { provide: Router, useValue: jasmine.createSpyObj('Router', ['navigate']) },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('carrega ranking paginado no loadData', () => {
    expect(rankingsServiceSpy.getPlayerRankings).toHaveBeenCalledWith({
      leagueId: undefined,
      position: undefined,
      page: 1,
      pageSize: 10,
    });
    expect(component.rankingTotal).toBe(42);
    expect(component.rankingTotalPages).toBe(5);
  });

  it('rankingRangeLabel mostra intervalo', () => {
    component.rankingPage = 2;
    component.rankingPageSize = 10;
    component.rankingTotal = 42;
    expect(component.rankingRangeLabel).toBe('11–20 de 42');
  });

  it('showRankingPagination quando há múltiplas páginas', () => {
    component.playerRankingsLoading = false;
    component.rankingTotalPages = 3;
    expect(component.showRankingPagination).toBeTrue();
    component.rankingTotalPages = 1;
    expect(component.showRankingPagination).toBeFalse();
  });

  it('onRankingLeagueChange reseta página e recarrega', () => {
    component.rankingPage = 3;
    component.rankingLeagueId = 'league-1';
    component.onRankingLeagueChange();
    expect(component.rankingPage).toBe(1);
    expect(rankingsServiceSpy.getPlayerRankings).toHaveBeenCalledWith(
      jasmine.objectContaining({ leagueId: 'league-1', page: 1 })
    );
  });

  it('goToRankingPage ignora páginas inválidas', () => {
    const callsBefore = rankingsServiceSpy.getPlayerRankings.calls.count();
    component.goToRankingPage(0);
    component.goToRankingPage(99);
    expect(rankingsServiceSpy.getPlayerRankings.calls.count()).toBe(callsBefore);
  });

  it('rankingPlayersTitle muda com filtro de posição', () => {
    expect(component.rankingPlayersTitle).toBe('Top Jogadores');
    component.rankingPosition = 'AWP';
    expect(component.rankingPlayersTitle).toContain('AWP');
  });

  it('pagina ligas e times localmente', () => {
    component.leagues = Array.from({ length: 15 }, (_, i) => ({
      id: `l${i}`,
      name: `Liga ${i}`,
      description: '',
      teams: [],
      status: 'upcoming',
    }));
    component.teams = Array.from({ length: 12 }, (_, i) => ({
      id: `t${i}`,
      name: `Time ${i}`,
      tag: `T${i}`,
      players: [],
      wins: 0,
      losses: 0,
      draws: 0,
      points: 0,
      roundsWon: 0,
      roundsLost: 0,
    }));
    expect(component.showLeaguesPagination).toBeTrue();
    expect(component.paginatedLeagues.length).toBe(10);
    component.goToLeaguesPage(1);
    expect(component.paginatedLeagues[0].id).toBe('l10');
  });
});
