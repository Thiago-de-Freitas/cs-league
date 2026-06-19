import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CdkDragDrop, CdkDrag, CdkDropList, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { Team } from '../../Models/interfaces';

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
      <th>Pontos</th>
      <th>Ações</th>
    </tr>
  </thead>
  <tbody cdkDropList (cdkDropListDropped)="onDrop($event)">
    <tr *ngFor="let team of teams; let i = index" cdkDrag>
      <td>{{ team.seed ?? (i + 1) }}</td>
      <td>
        <img *ngIf="team.logoUrl" [src]="team.logoUrl" alt="Logo do time" width="32" height="32">
      </td>
      <td>{{ team.name }}</td>
      <td>{{ team.wins }}</td>
      <td>{{ team.losses }}</td>
      <td>{{ team.points }}</td>
      <td>
        <button (click)="editTeam.emit(team)">Editar</button>
        <button (click)="removeTeam.emit(team.id)">Remover</button>
      </td>
    </tr>
  </tbody>
</table>
  `,
  styleUrls: ['./league-details.component.css']
})
export class LeagueTeamsTableComponent {
  @Input() teams: Team[] = [];
  @Output() teamsReordered = new EventEmitter<Team[]>();
  @Output() editTeam = new EventEmitter<Team>();
  @Output() removeTeam = new EventEmitter<string>();

  onDrop(event: CdkDragDrop<Team[]>) {
    moveItemInArray(this.teams, event.previousIndex, event.currentIndex);
    this.teams.forEach((team, idx) => team.seed = idx + 1);
    this.teamsReordered.emit(this.teams);
  }
} 