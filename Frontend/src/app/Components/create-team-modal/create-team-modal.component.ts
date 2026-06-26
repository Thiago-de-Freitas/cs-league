import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { TeamService } from '../../Services/team.service';
import { Team, User } from '../../Models/interfaces';
import { UserSearchPickerComponent } from '../user-search-picker/user-search-picker.component';
import { getPlayerPositionLabel } from '../../Utils/player-positions';

export interface TeamCreatedEvent {
  team: Team;
  message: string;
}

@Component({
  selector: 'app-create-team-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, UserSearchPickerComponent],
  templateUrl: './create-team-modal.component.html',
  styleUrls: ['./create-team-modal.component.css']
})
export class CreateTeamModalComponent {
  @Output() closed = new EventEmitter<void>();
  @Output() created = new EventEmitter<TeamCreatedEvent>();

  form: FormGroup;
  invitedMembers: User[] = [];
  errorMessage = '';
  loading = false;

  constructor(
    private fb: FormBuilder,
    private teamService: TeamService
  ) {
    this.form = this.fb.group({
      teamName: ['', Validators.required],
      teamTag: ['', [Validators.required, Validators.maxLength(5)]],
      ownerAsMember: [true],
    });
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('gc-modal-backdrop')) {
      this.close();
    }
  }

  close(): void {
    if (!this.loading) {
      this.closed.emit();
    }
  }

  get invitedUserIds(): string[] {
    return this.invitedMembers.map((m) => m.id);
  }

  inviteUser(user: User): void {
    if (!this.invitedMembers.some((m) => m.id === user.id)) {
      this.invitedMembers.push(user);
    }
  }

  formatPosition(position: string | null | undefined): string {
    return getPlayerPositionLabel(position);
  }

  removeInvitedUser(user: User): void {
    this.invitedMembers = this.invitedMembers.filter((m) => m.id !== user.id);
  }

  onSubmit(): void {
    if (!this.form.valid) {
      this.errorMessage = 'Preencha o nome e a tag do time.';
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    const { teamName, teamTag, ownerAsMember } = this.form.value;

    this.teamService.createTeam(teamName, teamTag, { ownerAsMember: !!ownerAsMember }).subscribe({
      next: (team) => {
        if (this.invitedMembers.length === 0) {
          this.loading = false;
          this.created.emit({ team, message: `Time "${teamName}" criado com sucesso!` });
          return;
        }
        forkJoin(
          this.invitedMembers.map((m) => this.teamService.inviteUser(team.id, m.id))
        ).subscribe({
          next: () => {
            this.loading = false;
            this.created.emit({
              team,
              message: `Time "${teamName}" criado com sucesso! Convites enviados.`
            });
          },
          error: () => {
            this.loading = false;
            this.created.emit({
              team,
              message: 'Time criado, mas alguns convites falharam.'
            });
          }
        });
      },
      error: (err) => {
        this.loading = false;
        this.errorMessage = err.error?.error || 'Erro ao criar time.';
      }
    });
  }
}
