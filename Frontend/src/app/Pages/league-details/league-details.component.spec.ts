import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { LeagueDetailsComponent } from './league-details.component';
import { LeagueService } from '../../Services/league.service';
import { TeamService } from '../../Services/team.service';
import { MatchService } from '../../Services/match.service';
import { AuthService } from '../../Services/auth.service';
import { NotificationService } from '../../Services/notification.service';
import { League } from '../../Models/interfaces';

function mockLeague(overrides: Partial<League> = {}): League {
  return {
    id: 'league-1',
    name: 'Liga Teste',
    description: '',
    teams: [],
    status: 'upcoming',
    format: 'single_elimination',
    ...overrides,
  };
}

describe('LeagueDetailsComponent', () => {
  let component: LeagueDetailsComponent;
  let fixture: ComponentFixture<LeagueDetailsComponent>;
  let leagueServiceSpy: jasmine.SpyObj<LeagueService>;
  let authServiceSpy: jasmine.SpyObj<AuthService>;
  let notifySpy: jasmine.SpyObj<NotificationService>;
  const paramMap$ = new BehaviorSubject(convertToParamMap({ id: 'league-1' }));

  beforeEach(async () => {
    leagueServiceSpy = jasmine.createSpyObj('LeagueService', [
      'getLeagueById',
      'registerTeamInLeague',
      'updateLeague',
    ]);
    authServiceSpy = jasmine.createSpyObj('AuthService', ['isLeagueOwner', 'isSystemAdmin'], {
      currentUser: { id: 'u1', email: 'a@test.com', displayName: 'Admin', role: 'ADMIN' },
    });
    notifySpy = jasmine.createSpyObj('NotificationService', ['success', 'error', 'info']);

    leagueServiceSpy.getLeagueById.and.returnValue(of(mockLeague()));
    authServiceSpy.isLeagueOwner.and.returnValue(true);
    authServiceSpy.isSystemAdmin.and.returnValue(true);

    await TestBed.configureTestingModule({
      imports: [LeagueDetailsComponent],
      providers: [
        { provide: LeagueService, useValue: leagueServiceSpy },
        { provide: TeamService, useValue: jasmine.createSpyObj('TeamService', ['getTeams']) },
        { provide: MatchService, useValue: jasmine.createSpyObj('MatchService', ['registerResult']) },
        { provide: AuthService, useValue: authServiceSpy },
        { provide: NotificationService, useValue: notifySpy },
        { provide: Router, useValue: jasmine.createSpyObj('Router', ['navigate']) },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: paramMap$.asObservable(),
            snapshot: { url: [] },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LeagueDetailsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('carrega detalhes da liga pelo id da rota', () => {
    expect(leagueServiceSpy.getLeagueById).toHaveBeenCalledWith('league-1');
    expect(component.league?.name).toBe('Liga Teste');
    expect(component.isAdmin).toBeTrue();
  });

  it('liga individual identifica formato one_vs_one', () => {
    component.league = mockLeague({ format: 'one_vs_one', teams: [
      { id: 't1', name: 'Alpha', tag: 'ALP', players: [], wins: 0, losses: 0, draws: 0, points: 0, roundsWon: 0, roundsLost: 0 },
      { id: 't2', name: 'Beta', tag: 'BET', players: [], wins: 0, losses: 0, draws: 0, points: 0, roundsWon: 0, roundsLost: 0 },
    ] });
    expect(component.isOneVsOneFormat).toBeTrue();
    expect(component.teamCapacityLabel).toBe('2 / 2 times');
    expect(component.oneVsOneTeamsLabel).toBe('Alpha vs Beta');
  });

  it('hasTournamentStarted para pickup quando há partidas', () => {
    component.league = mockLeague({
      format: 'one_vs_one',
      matches: [{ id: 'm1', status: 'scheduled' } as never],
    });
    expect(component.hasTournamentStarted).toBeTrue();
    expect(component.hasLeagueMatches).toBeTrue();
  });

  it('canArchive exige admin, não arquivada e partidas concluídas', () => {
    component.isAdmin = true;
    component.league = mockLeague({
      status: 'ongoing',
      matches: [
        { id: 'm1', status: 'completed' } as never,
        { id: 'm2', status: 'completed' } as never,
      ],
    });
    expect(component.canArchive).toBeTrue();
    component.league = mockLeague({ status: 'archived', matches: [{ id: 'm1', status: 'completed' } as never] });
    expect(component.canArchive).toBeFalse();
  });

  it('isRegistrationOpen bloqueia após início do torneio', () => {
    component.league = mockLeague({
      registrationOpen: true,
      status: 'upcoming',
      matches: [],
    });
    expect(component.isRegistrationOpen).toBeTrue();
    component.league = mockLeague({
      registrationOpen: true,
      status: 'upcoming',
      format: 'single_elimination',
      matches: [{ id: 'm1', status: 'scheduled', round: 1 } as never],
    });
    expect(component.hasTournamentStarted).toBeTrue();
    expect(component.isRegistrationOpen).toBeFalse();
  });

  it('onPickupStateChanged recarrega liga', () => {
    const updated = mockLeague({ name: 'Atualizada' });
    leagueServiceSpy.getLeagueById.and.returnValue(of(updated));
    component.onPickupStateChanged();
    expect(component.league?.name).toBe('Atualizada');
  });

  it('selectionOverLimit detecta excesso de times selecionados', () => {
    component.league = mockLeague({ maxTeams: 4, teams: [{ id: 't1', name: 'T1', players: [], wins: 0, losses: 0, draws: 0, points: 0, roundsWon: 0, roundsLost: 0 }] });
    component.selectedTeamIds = ['a', 'b', 'c', 'd'];
    expect(component.selectionOverLimit).toBeTrue();
    expect(component.canSubmitTeamSelection).toBeFalse();
  });

  it('formato de grupos calcula jogos esperados', () => {
    component.league = mockLeague({
      format: 'group_stage',
      groupCount: 1,
      homeAndAway: false,
      teams: Array.from({ length: 4 }, (_, i) => ({
        id: `t${i}`,
        name: `Time ${i}`,
        players: [],
        wins: 0,
        losses: 0,
        draws: 0,
        points: 0,
        roundsWon: 0,
        roundsLost: 0,
      })),
    });
    expect(component.isGroupStageFormat).toBeTrue();
    expect(component.isSingleGroupFormat).toBeTrue();
    expect(component.expectedRoundRobinMatches).toBe(6);
  });
});
