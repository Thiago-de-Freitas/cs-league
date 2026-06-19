import { Component, OnInit } from '@angular/core';
import { CommonModule, NgIf, DatePipe } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { League, Team, Match } from '../../Models/interfaces';
import { LeagueService } from '../../Services/league.service';
import { AuthService } from '../../Services/auth.service';
import { MatchService } from '../../Services/match.service';
import { TeamService } from '../../Services/team.service';
import { LeagueTeamsTableComponent } from './league-teams-table.component';
import { LeagueBracketComponent } from '../../Components/league-bracket/league-bracket.component';
import { ALLOWED_BRACKET_SIZES } from '../../Utils/bracket.util';
import { concatMap, from, last } from 'rxjs';

@Component({
  selector: 'app-league-details',
  standalone: true,
  imports: [
    CommonModule,
    NgIf,
    DatePipe,
    RouterModule,
    FormsModule,
    LeagueTeamsTableComponent,
    LeagueBracketComponent,
  ],
  templateUrl: './league-details.component.html',
  styleUrls: ['./league-details.component.css'],
})
export class LeagueDetailsComponent implements OnInit {
  leagueId: string | null = null;
  league: League | null = null;
  isLoading = true;
  isAdmin = false;
  errorMsg = '';
  showAddTeam = false;
  showCreateMatch = false;
  selectedTeamIds: string[] = [];
  addingTeams = false;
  matchTeam1Id = '';
  matchTeam2Id = '';
  matchMap = '';
  availableTeams: Team[] = [];
  bracketSizes = ALLOWED_BRACKET_SIZES;
  editMaxTeams = false;
  newMaxTeams = 8;
  generatingBracket = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private leagueService: LeagueService,
    private matchService: MatchService,
    private teamService: TeamService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      this.leagueId = params.get('id');
      if (this.leagueId) {
        this.fetchLeagueDetails(this.leagueId);
      }
    });
  }

  fetchLeagueDetails(id: string): void {
    this.isLoading = true;
    this.errorMsg = '';
    this.leagueService.getLeagueById(id).subscribe({
      next: (league) => {
        this.league = league;
        this.newMaxTeams = league.maxTeams || 8;
        this.isAdmin = this.authService.isLeagueOwner(league.ownerId || '');
        this.isLoading = false;
      },
      error: () => {
        this.errorMsg = 'Erro ao carregar detalhes da liga.';
        this.isLoading = false;
      }
    });
  }

  get teamsAtCapacity(): boolean {
    if (!this.league) return false;
    return this.league.teams.length >= (this.league.maxTeams || 8);
  }

  get remainingSlots(): number {
    if (!this.league) return 0;
    return (this.league.maxTeams || 8) - this.league.teams.length;
  }

  updateMaxTeams(): void {
    if (!this.leagueId) return;
    this.leagueService.updateLeague(this.leagueId, { maxTeams: Number(this.newMaxTeams) }).subscribe({
      next: (league) => {
        this.league = league;
        this.editMaxTeams = false;
      },
      error: (err) => alert(err.error?.error || 'Erro ao atualizar limite de times')
    });
  }

  generateBracket(): void {
    if (!this.leagueId) return;
    this.generatingBracket = true;
    this.leagueService.generateBracket(this.leagueId).subscribe({
      next: (league) => {
        this.league = league;
        this.generatingBracket = false;
      },
      error: (err) => {
        this.generatingBracket = false;
        alert(err.error?.error || 'Erro ao gerar chaveamento');
      }
    });
  }

  openAddTeam(): void {
    if (this.teamsAtCapacity) {
      alert(`Limite de ${this.league?.maxTeams} times atingido.`);
      return;
    }
    this.showAddTeam = true;
    this.selectedTeamIds = [];
    this.teamService.getTeams().subscribe({
      next: (teams) => {
        const inLeague = new Set(this.league?.teams.map((t) => t.id) || []);
        this.availableTeams = teams.filter((t) => !inLeague.has(t.id));
      }
    });
  }

  addTeamsToLeague(): void {
    if (!this.leagueId || this.selectedTeamIds.length === 0) return;

    const toAdd = this.selectedTeamIds.slice(0, this.remainingSlots);
    if (toAdd.length === 0) {
      alert('Limite de times da liga atingido.');
      return;
    }
    if (toAdd.length < this.selectedTeamIds.length) {
      alert(`Só é possível adicionar mais ${this.remainingSlots} time(s).`);
    }

    this.addingTeams = true;
    from(toAdd).pipe(
      concatMap((teamId) => this.leagueService.addTeamToLeague(this.leagueId!, teamId)),
      last()
    ).subscribe({
      next: (league) => {
        this.league = league;
        this.showAddTeam = false;
        this.selectedTeamIds = [];
        this.addingTeams = false;
      },
      error: (err) => {
        this.addingTeams = false;
        alert(err.error?.error || 'Erro ao adicionar times');
        if (this.leagueId) this.fetchLeagueDetails(this.leagueId);
      }
    });
  }

  cancelAddTeams(): void {
    this.showAddTeam = false;
    this.selectedTeamIds = [];
  }

  createMatch(): void {
    if (!this.leagueId || !this.matchTeam1Id || !this.matchTeam2Id) return;
    this.leagueService.createMatch(this.leagueId, this.matchTeam1Id, this.matchTeam2Id, this.matchMap).subscribe({
      next: () => {
        this.showCreateMatch = false;
        this.matchTeam1Id = '';
        this.matchTeam2Id = '';
        this.matchMap = '';
        if (this.leagueId) this.fetchLeagueDetails(this.leagueId);
      },
      error: (err) => alert(err.error?.error || 'Erro ao criar partida')
    });
  }

  registerResult(match: Match, winnerId: string): void {
    this.matchService.registerResult(match.id, winnerId).subscribe({
      next: () => {
        if (this.leagueId) this.fetchLeagueDetails(this.leagueId);
      },
      error: (err) => alert(err.error?.error || 'Erro ao registrar resultado')
    });
  }

  onTeamsReordered(teams: Team[]): void {
    if (!this.leagueId) return;
    const payload = teams.map((t, i) => ({ teamId: t.id, seed: i + 1 }));
    this.leagueService.updateTeamsOrder(this.leagueId, payload).subscribe();
  }

  onEditTeam(team: Team): void {
    this.router.navigate(['/team-details', team.id]);
  }

  onRemoveTeam(teamId: string): void {
    if (!this.leagueId || !confirm('Remover este time da liga?')) return;
    this.leagueService.removeTeamFromLeague(this.leagueId, teamId).subscribe({
      next: (league) => (this.league = league),
      error: (err) => alert(err.error?.error || 'Erro ao remover time')
    });
  }

  goToMatch(matchId: string): void {
    this.router.navigate(['/match', matchId]);
  }
}
