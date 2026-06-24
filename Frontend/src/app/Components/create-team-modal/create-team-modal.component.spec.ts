import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { of } from 'rxjs';
import { CreateTeamModalComponent } from './create-team-modal.component';
import { TeamService } from '../../Services/team.service';

describe('CreateTeamModalComponent', () => {
  let component: CreateTeamModalComponent;
  let fixture: ComponentFixture<CreateTeamModalComponent>;
  let teamServiceSpy: jasmine.SpyObj<TeamService>;

  const mockTeam = { id: 't1', name: 'Test', tag: 'TST', players: [], wins: 0, losses: 0, points: 0 };

  beforeEach(async () => {
    teamServiceSpy = jasmine.createSpyObj('TeamService', ['createTeam', 'searchUsers', 'inviteUser']);
    teamServiceSpy.createTeam.and.returnValue(of(mockTeam));
    teamServiceSpy.searchUsers.and.returnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [CreateTeamModalComponent, ReactiveFormsModule, FormsModule],
      providers: [{ provide: TeamService, useValue: teamServiceSpy }],
    }).compileComponents();

    fixture = TestBed.createComponent(CreateTeamModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('ownerAsMember defaults to true', () => {
    expect(component.form.get('ownerAsMember')?.value).toBeTrue();
  });

  it('submits team with ownerAsMember false when unchecked', () => {
    component.form.patchValue({
      teamName: 'Managers',
      teamTag: 'MGR',
      ownerAsMember: false,
    });
    component.onSubmit();

    expect(teamServiceSpy.createTeam).toHaveBeenCalledWith('Managers', 'MGR', { ownerAsMember: false });
  });

  it('shows error when form is invalid', () => {
    component.form.patchValue({ teamName: '', teamTag: '' });
    component.onSubmit();
    expect(component.errorMessage).toContain('Preencha');
    expect(teamServiceSpy.createTeam).not.toHaveBeenCalled();
  });
});
