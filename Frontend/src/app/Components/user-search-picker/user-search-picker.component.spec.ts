import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { of } from 'rxjs';
import { UserSearchPickerComponent } from './user-search-picker.component';
import { TeamService } from '../../Services/team.service';
import { User } from '../../Models/interfaces';

describe('UserSearchPickerComponent', () => {
  let component: UserSearchPickerComponent;
  let fixture: ComponentFixture<UserSearchPickerComponent>;
  let teamServiceSpy: jasmine.SpyObj<TeamService>;

  const mockUsers: User[] = [
    { id: 'u1', email: 'alpha@test.com', displayName: 'Alpha', role: 'USER' },
    { id: 'u2', email: 'beta@test.com', displayName: 'Beta', role: 'USER' },
  ];

  beforeEach(async () => {
    teamServiceSpy = jasmine.createSpyObj('TeamService', ['searchUsers']);
    teamServiceSpy.searchUsers.and.returnValue(of(mockUsers));

    await TestBed.configureTestingModule({
      imports: [UserSearchPickerComponent],
      providers: [{ provide: TeamService, useValue: teamServiceSpy }],
    }).compileComponents();

    fixture = TestBed.createComponent(UserSearchPickerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('cria o componente', () => {
    expect(component).toBeTruthy();
  });

  it('não busca com menos de 2 caracteres', fakeAsync(() => {
    component.query = 'a';
    component.onQueryInput();
    tick(300);
    expect(teamServiceSpy.searchUsers).not.toHaveBeenCalled();
    expect(component.results).toEqual([]);
  }));

  it('busca usuários após debounce', fakeAsync(() => {
    component.query = 'al';
    component.onQueryInput();
    tick(300);
    expect(teamServiceSpy.searchUsers).toHaveBeenCalledWith('al');
    expect(component.results.length).toBe(2);
  }));

  it('exclui usuários da lista excludeUserIds', fakeAsync(() => {
    component.excludeUserIds = ['u1'];
    component.query = 'al';
    component.onQueryInput();
    tick(300);
    expect(component.results.map((u) => u.id)).toEqual(['u2']);
  }));

  it('pick emite usuário e limpa busca', () => {
    spyOn(component.userPick, 'emit');
    component.query = 'alpha';
    component.results = [mockUsers[0]];
    component.pick(mockUsers[0]);
    expect(component.userPick.emit).toHaveBeenCalledWith(mockUsers[0]);
    expect(component.query).toBe('');
    expect(component.results).toEqual([]);
  });

  it('showEmpty quando busca não retorna resultados', fakeAsync(() => {
    teamServiceSpy.searchUsers.and.returnValue(of([]));
    component.query = 'zzz';
    component.onQueryInput();
    tick(300);
    expect(component.showEmpty).toBeTrue();
  }));

  it('aplica classe embedInToolbar no host', () => {
    component.embedInToolbar = true;
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.classList.contains('user-search-embed')).toBeTrue();
  });
});
