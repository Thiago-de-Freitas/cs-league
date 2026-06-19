import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { forkJoin } from 'rxjs';
import { TeamService } from '../../Services/team.service';
import { Team, User } from '../../Models/interfaces';

@Component({
  selector: 'app-create-team',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, FormsModule],
  templateUrl: './create-team.component.html',
  styleUrls: ['./create-team.component.css']
})
export class CreateTeamComponent implements OnInit {
  createTeamForm: FormGroup;
  searchUserQuery = '';
  searchResults: User[] = [];
  invitedMembers: User[] = [];
  successMessage = '';
  errorMessage = '';
  createdTeamId: string | null = null;
  teams: Team[] = [];
  loading = false;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private teamService: TeamService
  ) {
    this.createTeamForm = this.fb.group({
      teamName: ['', Validators.required],
      teamTag: ['', [Validators.required, Validators.maxLength(5)]]
    });
  }

  ngOnInit(): void {
    this.loadTeams();
  }

  loadTeams(): void {
    this.teamService.getTeams().subscribe({
      next: (teams) => (this.teams = teams),
      error: () => {}
    });
  }

  onSearchUsers(): void {
    if (this.searchUserQuery.length > 2) {
      this.teamService.searchUsers(this.searchUserQuery).subscribe({
        next: (users) => {
          this.searchResults = users.filter(
            (u) => !this.invitedMembers.some((m) => m.id === u.id)
          );
        }
      });
    } else {
      this.searchResults = [];
    }
  }

  inviteUser(user: User): void {
    if (!this.invitedMembers.some((m) => m.id === user.id)) {
      this.invitedMembers.push(user);
      this.searchResults = this.searchResults.filter((r) => r.id !== user.id);
      this.searchUserQuery = '';
    }
  }

  removeInvitedUser(user: User): void {
    this.invitedMembers = this.invitedMembers.filter((m) => m.id !== user.id);
  }

  onCreateTeam(): void {
    if (!this.createTeamForm.valid) {
      this.errorMessage = 'Preencha o nome e a tag do time.';
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    const { teamName, teamTag } = this.createTeamForm.value;

    this.teamService.createTeam(teamName, teamTag).subscribe({
      next: (team) => {
        this.createdTeamId = team.id;
        if (this.invitedMembers.length === 0) {
          this.loading = false;
          this.successMessage = `Time "${teamName}" criado com sucesso!`;
          this.createTeamForm.reset();
          this.loadTeams();
          return;
        }
        forkJoin(
          this.invitedMembers.map((m) => this.teamService.inviteUser(team.id, m.id))
        ).subscribe({
          next: () => {
            this.loading = false;
            this.successMessage = `Time "${teamName}" criado com sucesso! Convites enviados.`;
            this.createTeamForm.reset();
            this.invitedMembers = [];
            this.loadTeams();
          },
          error: () => {
            this.loading = false;
            this.successMessage = `Time criado, mas alguns convites falharam.`;
            this.loadTeams();
          }
        });
      },
      error: (err) => {
        this.loading = false;
        this.errorMessage = err.error?.error || 'Erro ao criar time.';
      }
    });
  }

  goToTeamDetails(): void {
    if (this.createdTeamId) {
      this.router.navigate(['/team-details', this.createdTeamId]);
    }
  }

  goToTeamDetailsById(id: string): void {
    this.router.navigate(['/team-details', id]);
  }
}
