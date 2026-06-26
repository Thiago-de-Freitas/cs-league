import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { Router, provideRouter } from '@angular/router';
import { AdminPlayersComponent } from './admin-players.component';
import { UsersService } from '../../Services/users.service';
import { AuthService } from '../../Services/auth.service';
import { AdminUserEntry } from '../../Models/interfaces';

describe('AdminPlayersComponent', () => {
  let component: AdminPlayersComponent;
  let fixture: ComponentFixture<AdminPlayersComponent>;
  let usersServiceSpy: jasmine.SpyObj<UsersService>;
  let authServiceSpy: jasmine.SpyObj<AuthService>;
  let routerSpy: Router;

  const mockUser: AdminUserEntry = {
    id: 'u1',
    email: 'player@test.com',
    displayName: 'Player One',
    steamId: '76561198000000001',
    avatarUrl: null,
    position: 'awp',
    positionLabel: 'AWPer',
    role: 'USER',
    isActive: true,
    bannedUntil: null,
    isBanned: false,
    createdAt: '2025-06-01T12:00:00Z',
    teamCount: 1,
  };

  beforeEach(async () => {
    usersServiceSpy = jasmine.createSpyObj('UsersService', [
      'listUsers',
      'deactivateUser',
      'activateUser',
      'banUser',
      'unbanUser',
      'deleteUser',
    ]);
    authServiceSpy = jasmine.createSpyObj('AuthService', ['isSystemAdmin'], {
      currentUser: { id: 'admin-1', role: 'ADMIN' },
    });

    authServiceSpy.isSystemAdmin.and.returnValue(true);
    usersServiceSpy.listUsers.and.returnValue(
      of({ users: [mockUser], page: 1, pageSize: 10, total: 1, totalPages: 1 })
    );

    await TestBed.configureTestingModule({
      imports: [AdminPlayersComponent],
      providers: [
        provideRouter([]),
        { provide: UsersService, useValue: usersServiceSpy },
        { provide: AuthService, useValue: authServiceSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminPlayersComponent);
    component = fixture.componentInstance;
    routerSpy = TestBed.inject(Router) as jasmine.SpyObj<Router>;
    spyOn(routerSpy, 'navigate');
    fixture.detectChanges();
  });

  it('redireciona usuários não admin', () => {
    authServiceSpy.isSystemAdmin.and.returnValue(false);
    component.ngOnInit();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('carrega jogadores com paginação padrão', () => {
    expect(usersServiceSpy.listUsers).toHaveBeenCalledWith({
      page: 1,
      pageSize: 10,
      q: '',
      position: undefined,
      role: undefined,
      status: undefined,
    });
    expect(component.users.length).toBe(1);
    expect(component.total).toBe(1);
  });

  it('applyFilters reseta para página 1', () => {
    component.page = 3;
    component.searchQuery = 'player';
    component.applyFilters();
    expect(component.page).toBe(1);
    expect(usersServiceSpy.listUsers).toHaveBeenCalledWith(
      jasmine.objectContaining({ page: 1, q: 'player' })
    );
  });

  it('getProfileLink retorna rota quando há steamId', () => {
    expect(component.getProfileLink(mockUser)).toEqual(['/player', '76561198000000001']);
    expect(component.getProfileLink({ ...mockUser, steamId: null })).toBeNull();
  });

  it('canModerate bloqueia admin e próprio usuário', () => {
    expect(component.canModerate(mockUser)).toBeTrue();
    expect(component.canModerate({ ...mockUser, id: 'admin-1' })).toBeFalse();
    expect(component.canModerate({ ...mockUser, role: 'ADMIN' })).toBeFalse();
  });

  it('confirmModeration aplica banimento', () => {
    const banned = { ...mockUser, isBanned: true, bannedUntil: '2025-07-01T00:00:00Z' };
    usersServiceSpy.banUser.and.returnValue(of({ user: banned }));
    component.openModeration(mockUser, 'ban');
    component.banDays = 7;
    component.confirmModeration();
    expect(usersServiceSpy.banUser).toHaveBeenCalledWith('u1', 7);
    expect(component.users[0].isBanned).toBeTrue();
  });

  it('confirmModeration exibe erro da API', () => {
    usersServiceSpy.deactivateUser.and.returnValue(throwError(() => ({ error: { error: 'Falhou' } })));
    component.openModeration(mockUser, 'deactivate');
    component.confirmModeration();
    expect(component.moderationError).toBe('Falhou');
  });
});
