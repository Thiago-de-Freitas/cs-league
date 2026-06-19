import { Component, OnInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TeamService } from '../../Services/team.service';
import { Team } from '../../Models/interfaces';
import { CreateTeamModalComponent, TeamCreatedEvent } from '../../Components/create-team-modal/create-team-modal.component';

@Component({
  selector: 'app-create-team',
  standalone: true,
  imports: [CommonModule, RouterModule, CreateTeamModalComponent],
  templateUrl: './create-team.component.html',
  styleUrls: ['./create-team.component.css']
})
export class CreateTeamComponent implements OnInit {
  teams: Team[] = [];
  loading = true;
  showCreateModal = false;
  successMessage = '';
  createdTeamId: string | null = null;

  constructor(
    private router: Router,
    private teamService: TeamService
  ) {}

  ngOnInit(): void {
    this.loadTeams();
  }

  loadTeams(): void {
    this.loading = true;
    this.teamService.getTeams().subscribe({
      next: (teams) => {
        this.teams = teams;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  openCreateModal(): void {
    this.showCreateModal = true;
    this.successMessage = '';
    this.createdTeamId = null;
  }

  closeCreateModal(): void {
    this.showCreateModal = false;
  }

  onTeamCreated(event: TeamCreatedEvent): void {
    this.showCreateModal = false;
    this.createdTeamId = event.team.id;
    this.successMessage = event.message;
    this.loadTeams();
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
