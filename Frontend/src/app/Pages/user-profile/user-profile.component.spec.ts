import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { provideRouter } from '@angular/router';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { UserProfileComponent } from './user-profile.component';
import { UsersService } from '../../Services/users.service';
import { PublicUserProfile } from '../../Models/interfaces';

describe('UserProfileComponent', () => {
  let component: UserProfileComponent;
  let fixture: ComponentFixture<UserProfileComponent>;
  let usersServiceSpy: jasmine.SpyObj<UsersService>;

  const mockProfile: PublicUserProfile = {
    id: 'u1',
    displayName: 'Player One',
    steamId: '76561198000000001',
    avatarUrl: null,
    position: 'awp',
    positionLabel: 'AWPer',
    role: 'USER',
    createdAt: '2025-06-01T12:00:00Z',
    teamCount: 0,
    teams: [],
    leagueStats: null,
    personalStats: null,
    isSelf: false,
  };

  beforeEach(async () => {
    usersServiceSpy = jasmine.createSpyObj('UsersService', ['getUserProfile']);
    usersServiceSpy.getUserProfile.and.returnValue(of(mockProfile));

    await TestBed.configureTestingModule({
      imports: [UserProfileComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ id: 'u1' })),
          },
        },
        { provide: UsersService, useValue: usersServiceSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UserProfileComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('carrega perfil público', () => {
    expect(usersServiceSpy.getUserProfile).toHaveBeenCalledWith('u1');
    expect(component.profile?.displayName).toBe('Player One');
    expect(component.loading).toBeFalse();
  });

  it('exibe erro quando perfil não existe', () => {
    usersServiceSpy.getUserProfile.and.returnValue(throwError(() => ({ error: { error: 'Jogador não encontrado' } })));
    component.loadProfile('missing');
    expect(component.errorMsg).toBe('Jogador não encontrado');
    expect(component.loading).toBeFalse();
  });

  it('exibe estatísticas individuais quando disponíveis', () => {
    usersServiceSpy.getUserProfile.and.returnValue(
      of({
        ...mockProfile,
        personalStats: {
          summary: {
            demosTotal: 2,
            demosCompleted: 2,
            kills: 40,
            deaths: 30,
            kd: 1.33,
            adr: 85,
            hsPercent: 45,
            kast: 72,
            rating: 1.1,
          },
          demos: [
            {
              demoId: 'd1',
              fileName: 'match.dem',
              status: 'completed',
              createdAt: '2025-06-01T12:00:00Z',
              kills: 20,
              deaths: 15,
              kd: 1.33,
              adr: 85,
              hsPercent: 45,
              kast: 72,
            },
          ],
        },
      })
    );
    component.loadProfile('u1');
    expect(component.hasPersonalStats).toBeTrue();
    expect(component.personalDemoStats.length).toBe(1);
  });
});
