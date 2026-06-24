import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CdkDragDrop, CdkDropList, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { Team } from '../../Models/interfaces';
import { AuthService } from '../../Services/auth.service';
import { resolveUploadAssetUrl } from '../../Utils/upload-asset.util';

@Component({
  selector: 'app-league-teams-table',
  standalone: true,
  imports: [
    CommonModule,
    DragDropModule,
  ],
  template: `
    <table class="team-table">
  <thead>
    <tr>
      <th>#</th>
      <th>Logo</th>
      <th>Nome</th>
      <th>Vitórias</th>
      <th>Derrotas</th>
      <th>Empates</th>
      <th>Pontos</th>
      <th>RF</th>
      <th>RS</th>
      <th>Saldo</th>
      <th *ngIf="showActionsColumn">Ações</th>
    </tr>
  </thead>
  <tbody cdkDropList [cdkDropListDisabled]="!canManageLeague" (cdkDropListDropped)="onDrop($event)">
    <tr *ngFor="let team of teams; let i = index" cdkDrag [cdkDragDisabled]="!canManageLeague">
      <td>{{ team.seed ?? (i + 1) }}</td>
      <td>
        <img
          *ngIf="teamLogoSrc(team) as logoSrc"
          [src]="logoSrc"
          alt="Logo do time"
          width="32"
          height="32"
          (error)="onTeamLogoError(team.id)">
        <span *ngIf="!teamLogoSrc(team)" class="team-tag-mini">{{ team.tag }}</span>
      </td>
      <td>{{ team.name }}</td>
      <td>{{ team.wins ?? 0 }}</td>
      <td>{{ team.losses ?? 0 }}</td>
      <td>{{ team.draws ?? 0 }}</td>
      <td>{{ team.points ?? 0 }}</td>
      <td>{{ team.roundsWon ?? 0 }}</td>
      <td>{{ team.roundsLost ?? 0 }}</td>
      <td>{{ team.roundDifference ?? ((team.roundsWon ?? 0) - (team.roundsLost ?? 0)) }}</td>
      <td *ngIf="showActionsColumn" class="team-actions-cell">
        <button *ngIf="canEditTeam(team)" type="button" class="btn btn-secondary btn-small" (click)="editTeam.emit(team)">Editar</button>
        <button *ngIf="canRemoveTeams" type="button" class="btn btn-danger btn-small" (click)="removeTeam.emit(team.id)">Remover</button>
        <span *ngIf="!canEditTeam(team) && !canRemoveTeams" class="meta">—</span>
      </td>
    </tr>
  </tbody>
</table>
  `,
  styleUrls: ['./league-details.component.css']
})
export class LeagueTeamsTableComponent {
  @Input() teams: Team[] = [];
  @Input() canManageLeague = false;
  @Input() canRemoveTeams = false;
  @Output() teamsReordered = new EventEmitter<Team[]>();
  @Output() editTeam = new EventEmitter<Team>();
  @Output() removeTeam = new EventEmitter<string>();

  private brokenLogoIds = new Set<string>();

  constructor(private authService: AuthService) {}

  teamLogoSrc(team: Team): string | null {
    if (!team.logoUrl || this.brokenLogoIds.has(team.id)) return null;
    return resolveUploadAssetUrl(team.logoUrl);
  }

  onTeamLogoError(teamId: string): void {
    this.brokenLogoIds.add(teamId);
  }

  get showActionsColumn(): boolean {
    return this.canRemoveTeams || this.canManageLeague || this.teams.some((t) => this.canEditTeam(t));
  }

  canEditTeam(team: Team): boolean {
    return this.authService.canManageTeam(team);
  }

  onDrop(event: CdkDragDrop<Team[]>) {
    if (!this.canManageLeague) return;
    moveItemInArray(this.teams, event.previousIndex, event.currentIndex);
    this.teams.forEach((team, idx) => team.seed = idx + 1);
    this.teamsReordered.emit(this.teams);
  }
} 