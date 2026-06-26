import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
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
    createdAt: '2025-06-01T12:00:00Z',
    teamCount: 1,
  };

  beforeEach(async () => {
    usersServiceSpy = jasmine.createSpyObj('UsersService', ['listUsers']);
    authServiceSpy = jasmine.createSpyObj('AuthService', ['isSystemAdmin']);

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
});
