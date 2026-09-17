/// <reference types="jasmine" />
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { TeamDetailsComponent } from './team-details.component';
import { TeamService } from '../../Services/team.service';
import { AuthService } from '../../Services/auth.service';
import { NotificationService } from '../../Services/notification.service';
import { Team } from '../../Models/interfaces';

const mockTeam: Team = {
  id: 't1',
  name: 'FURIA',
  tag: 'FUR',
  ownerId: 'u1',
  players: [],
  wins: 0,
  losses: 0,
  draws: 0,
  points: 0,
  roundsWon: 0,
  roundsLost: 0,
};

describe('TeamDetailsComponent — editar nome', () => {
  let component: TeamDetailsComponent;
  let fixture: ComponentFixture<TeamDetailsComponent>;
  let teamServiceSpy: jasmine.SpyObj<TeamService>;
  let notifySpy: jasmine.SpyObj<NotificationService>;

  beforeEach(async () => {
    teamServiceSpy = jasmine.createSpyObj('TeamService', [
      'getTeamById',
      'getPendingInvites',
      'updateTeam',
    ]);
    teamServiceSpy.getTeamById.and.returnValue(of(mockTeam));
    teamServiceSpy.getPendingInvites.and.returnValue(of([]));
    teamServiceSpy.updateTeam.and.returnValue(of({ ...mockTeam, name: 'Nova FURIA' }));

    notifySpy = jasmine.createSpyObj('NotificationService', ['success', 'error', 'warning', 'info']);

    await TestBed.configureTestingModule({
      imports: [TeamDetailsComponent],
      providers: [
        provideRouter([]),
        { provide: TeamService, useValue: teamServiceSpy },
        {
          provide: AuthService,
          useValue: {
            isTeamOwner: () => true,
            isSystemAdmin: () => false,
            currentUser: { id: 'u1' },
          },
        },
        { provide: NotificationService, useValue: notifySpy },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: 't1' }) } },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TeamDetailsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('preenche o campo com o nome atual e marca dirty após edição', () => {
    expect(component.editName).toBe('FURIA');
    expect(component.isNameDirty).toBeFalse();
    component.editName = 'Nova FURIA';
    expect(component.isNameDirty).toBeTrue();
  });

  it('salva o nome via PUT quando o criador altera', () => {
    component.editName = 'Nova FURIA';
    component.saveTeamName();
    expect(teamServiceSpy.updateTeam).toHaveBeenCalledWith('t1', { name: 'Nova FURIA' });
    expect(component.team?.name).toBe('Nova FURIA');
    expect(notifySpy.success).toHaveBeenCalled();
  });

  it('não chama a API se o nome não mudou', () => {
    component.editName = 'FURIA';
    component.saveTeamName();
    expect(teamServiceSpy.updateTeam).not.toHaveBeenCalled();
  });
});
