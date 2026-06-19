import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { LeagueService } from '../../Services/league.service';
import { TeamService } from '../../Services/team.service';
import { AuthService } from '../../Services/auth.service';
import { League, Team } from '../../Models/interfaces';
import { CreateLeagueModalComponent } from '../../Components/create-league-modal/create-league-modal.component';
import { CreateTeamModalComponent, TeamCreatedEvent } from '../../Components/create-team-modal/create-team-modal.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, CreateLeagueModalComponent, CreateTeamModalComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit {
  leagues: League[] = [];
  teams: Team[] = [];
  loading = true;
  userName = '';
  showCreateLeagueModal = false;
  showCreateTeamModal = false;

  constructor(
    private leagueService: LeagueService,
    private teamService: TeamService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.authService.currentUser$.subscribe((user) => {
      this.userName = user?.displayName || '';
    });
    this.loadData();
  }

  loadData(): void {
    this.loading = true;
    this.leagueService.getLeagues().subscribe({
      next: (leagues) => {
        this.leagues = leagues;
        this.loading = false;
      },
      error: () => (this.loading = false)
    });
    this.teamService.getTeams().subscribe({
      next: (teams) => (this.teams = teams)
    });
  }

  openCreateLeagueModal(): void {
    this.showCreateLeagueModal = true;
  }

  closeCreateLeagueModal(): void {
    this.showCreateLeagueModal = false;
  }

  onLeagueCreated(league: League): void {
    this.showCreateLeagueModal = false;
    this.leagueService.getLeagues().subscribe({
      next: (leagues) => (this.leagues = leagues)
    });
    this.router.navigate(['/league-details', league.id]);
  }

  openCreateTeamModal(): void {
    this.showCreateTeamModal = true;
  }

  closeCreateTeamModal(): void {
    this.showCreateTeamModal = false;
  }

  onTeamCreated(event: TeamCreatedEvent): void {
    this.showCreateTeamModal = false;
    this.teamService.getTeams().subscribe({
      next: (teams) => (this.teams = teams)
    });
    this.router.navigate(['/team-details', event.team.id]);
  }
}
