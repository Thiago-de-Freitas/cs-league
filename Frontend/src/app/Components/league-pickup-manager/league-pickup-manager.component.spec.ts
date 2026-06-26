import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { Router } from '@angular/router';
import { LeaguePickupManagerComponent } from './league-pickup-manager.component';
import { LeagueService } from '../../Services/league.service';
import { NotificationService } from '../../Services/notification.service';
import { TeamService } from '../../Services/team.service';
import { PickupLeagueState, PickupPlayer, User } from '../../Models/interfaces';

function mockPickupState(overrides: Partial<PickupLeagueState> = {}): PickupLeagueState {
  return {
    teamCount: 2,
    playersPerTeam: 5,
    balanceMode: 'rating',
    balanceModes: ['rating'],
    balancedAt: null,
    pool: [],
    squads: [
      { id: 's1', name: 'Time 1', tag: 'T1', seed: 1, players: [], teamRating: null },
      { id: 's2', name: 'Time 2', tag: 'T2', seed: 2, players: [], teamRating: null },
    ],
    ...overrides,
  };
}

describe('LeaguePickupManagerComponent', () => {
  let component: LeaguePickupManagerComponent;
  let fixture: ComponentFixture<LeaguePickupManagerComponent>;
  let leagueServiceSpy: jasmine.SpyObj<LeagueService>;
  let notifySpy: jasmine.SpyObj<NotificationService>;
  let routerSpy: jasmine.SpyObj<Router>;
  let teamServiceSpy: jasmine.SpyObj<TeamService>;

  beforeEach(async () => {
    leagueServiceSpy = jasmine.createSpyObj('LeagueService', [
      'getPickupState',
      'addPickupPlayer',
      'removePickupPlayer',
      'assignPickupPlayer',
      'updatePickupSquads',
      'updatePickupSettings',
      'balancePickupLeague',
      'startPickupMatch',
    ]);
    notifySpy = jasmine.createSpyObj('NotificationService', ['info', 'success', 'error']);
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);
    teamServiceSpy = jasmine.createSpyObj('TeamService', ['searchUsers']);
    teamServiceSpy.searchUsers.and.returnValue(of([]));

    leagueServiceSpy.getPickupState.and.returnValue(of(mockPickupState()));

    await TestBed.configureTestingModule({
      imports: [LeaguePickupManagerComponent],
      providers: [
        { provide: LeagueService, useValue: leagueServiceSpy },
        { provide: NotificationService, useValue: notifySpy },
        { provide: Router, useValue: routerSpy },
        { provide: TeamService, useValue: teamServiceSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LeaguePickupManagerComponent);
    component = fixture.componentInstance;
    component.leagueId = 'league-1';
    fixture.detectChanges();
  });

  it('carrega estado ao iniciar', () => {
    expect(leagueServiceSpy.getPickupState).toHaveBeenCalledWith('league-1');
    expect(component.state?.squads.length).toBe(2);
    expect(component.inviteTeamId).toBe('s1');
  });

  it('canStartMatch exige jogadores em ambos os times', () => {
    const player: PickupPlayer = {
      id: 'p1',
      userId: 'u1',
      displayName: 'Player',
      steamId: null,
      avatarUrl: null,
      position: null,
      positionLabel: null,
      teamId: 's1',
      adr: null,
      hsPercent: null,
      rating: null,
      matches: 0,
    };
    component.state = mockPickupState({
      squads: [
        { id: 's1', name: 'Time 1', tag: 'T1', seed: 1, players: [player], teamRating: null },
        { id: 's2', name: 'Time 2', tag: 'T2', seed: 2, players: [], teamRating: null },
      ],
    });
    expect(component.canStartMatch).toBeFalse();

    component.state = mockPickupState({
      squads: [
        { id: 's1', name: 'Time 1', tag: 'T1', seed: 1, players: [player], teamRating: null },
        { id: 's2', name: 'Time 2', tag: 'T2', seed: 2, players: [{ ...player, id: 'p2', userId: 'u2', teamId: 's2' }], teamRating: null },
      ],
    });
    expect(component.canStartMatch).toBeTrue();
  });

  it('toggleBalanceMode impede remover o último critério', () => {
    component.balanceModes = ['rating'];
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = false;
    component.toggleBalanceMode('rating', { target: input } as unknown as Event);
    expect(component.balanceModes).toEqual(['rating']);
    expect(notifySpy.info).toHaveBeenCalled();
  });

  it('onPlayerPicked envia teamId selecionado', () => {
    const user: User = { id: 'u1', email: 'u@test.com', displayName: 'User', role: 'USER' };
    component.inviteTeamId = 's2';
    leagueServiceSpy.addPickupPlayer.and.returnValue(of(mockPickupState()));
    component.onPlayerPicked(user);
    expect(leagueServiceSpy.addPickupPlayer).toHaveBeenCalledWith('league-1', 'u1', 's2');
    expect(notifySpy.success).toHaveBeenCalled();
  });

  it('saveSquads chama updatePickupSquads', () => {
    const squads = [
      { id: 's1', name: 'Alpha', tag: 'ALP' },
      { id: 's2', name: 'Beta', tag: 'BET' },
    ];
    component.squadDrafts = squads;
    leagueServiceSpy.updatePickupSquads.and.returnValue(of(mockPickupState()));
    component.saveSquads();
    expect(leagueServiceSpy.updatePickupSquads).toHaveBeenCalledWith('league-1', squads);
    expect(notifySpy.success).toHaveBeenCalledWith('Times atualizados.');
  });

  it('startMatch navega para a partida criada', () => {
    const state = mockPickupState();
    leagueServiceSpy.startPickupMatch.and.returnValue(
      of({ matchId: 'match-99', seriesId: 'series-1', matchIds: ['match-99'], state })
    );
    component.startMatch();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/match', 'match-99']);
    expect(notifySpy.success).toHaveBeenCalledWith('Confronto iniciado!');
  });
});
