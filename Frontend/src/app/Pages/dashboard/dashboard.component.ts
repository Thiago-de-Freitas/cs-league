import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { LeagueService } from '../../Services/league.service';
import { TeamService } from '../../Services/team.service';
import { AuthService } from '../../Services/auth.service';
import { League, Team } from '../../Models/interfaces';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit {
  leagues: League[] = [];
  teams: Team[] = [];
  loading = true;
  userName = '';

  constructor(
    private leagueService: LeagueService,
    private teamService: TeamService,
    private authService: AuthService
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
}
