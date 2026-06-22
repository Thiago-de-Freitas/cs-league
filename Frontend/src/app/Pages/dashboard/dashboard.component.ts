import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { forkJoin } from 'rxjs';
import { LeagueService } from '../../Services/league.service';
import { TeamService } from '../../Services/team.service';
import { RankingsService } from '../../Services/rankings.service';
import { AuthService } from '../../Services/auth.service';
import { League, Team, TeamInvite, PlayerRankingEntry, TeamRankingEntry } from '../../Models/interfaces';
import { CreateLeagueModalComponent } from '../../Components/create-league-modal/create-league-modal.component';
import { CreateTeamModalComponent, TeamCreatedEvent } from '../../Components/create-team-modal/create-team-modal.component';
import { DemoUploadModalComponent } from '../../Components/demo-upload-modal/demo-upload-modal.component';
import { Demo } from '../../Models/interfaces';
import { formatTeamCapacity } from '../../Utils/bracket.util';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, CreateLeagueModalComponent, CreateTeamModalComponent, DemoUploadModalComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit {
  leagues: League[] = [];
  openLeagues: League[] = [];
  teams: Team[] = [];
  loading = true;
  userName = '';
  showCreateLeagueModal = false;
  showCreateTeamModal = false;
  showUploadModal = false;
  showArchivedLeagues = false;
  pendingInvites: TeamInvite[] = [];
  playerRankings: PlayerRankingEntry[] = [];
  teamRankings: TeamRankingEntry[] = [];
  rankingsLoading = true;
  rankingLeagueId = '';
  formatTeamCapacity = formatTeamCapacity;

  constructor(
    private leagueService: LeagueService,
    private teamService: TeamService,
    private rankingsService: RankingsService,
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
    forkJoin({
      leagues: this.leagueService.getLeagues(this.showArchivedLeagues),
      openLeagues: this.leagueService.getOpenLeagues(),
      teams: this.teamService.getTeams(),
      invites: this.teamService.getPendingInvites(),
    }).subscribe({
      next: ({ leagues, openLeagues, teams, invites }) => {
        this.leagues = leagues;
        const myIds = new Set(leagues.map((l) => l.id));
        this.openLeagues = openLeagues.filter((l) => !myIds.has(l.id));
        this.teams = teams;
        this.pendingInvites = invites;
        this.loading = false;
      },
      error: () => (this.loading = false),
    });
    this.loadRankings();
  }

  loadRankings(): void {
    this.rankingsLoading = true;
    const leagueId = this.rankingLeagueId || undefined;
    this.rankingsService.getPlayerRankings(leagueId).subscribe({
      next: (players) => (this.playerRankings = players),
      error: () => (this.playerRankings = [])
    });
    this.rankingsService.getTeamRankings().subscribe({
      next: (teams) => {
        this.teamRankings = teams;
        this.rankingsLoading = false;
      },
      error: () => {
        this.teamRankings = [];
        this.rankingsLoading = false;
      }
    });
  }

  onRankingLeagueChange(): void {
    this.loadRankings();
  }

  getPlayerProfileLink(player: PlayerRankingEntry): string[] | null {
    if (!player.steamId?.trim()) return null;
    return ['/player', player.steamId];
  }

  getPlayerLabel(player: PlayerRankingEntry): string {
    return player.displayName || player.playerName;
  }

  getKd(player: PlayerRankingEntry): string {
    return player.deaths > 0 ? player.kd.toFixed(2) : player.kills.toString();
  }

  acceptInvite(invite: TeamInvite): void {
    if (!invite.team) return;
    this.teamService.acceptInvite(invite.team.id, invite.id).subscribe({
      next: () => {
        this.pendingInvites = this.pendingInvites.filter((i) => i.id !== invite.id);
        this.teamService.getTeams().subscribe({
          next: (teams) => (this.teams = teams)
        });
      }
    });
  }

  rejectInvite(invite: TeamInvite): void {
    if (!invite.team) return;
    this.teamService.rejectInvite(invite.team.id, invite.id).subscribe({
      next: () => {
        this.pendingInvites = this.pendingInvites.filter((i) => i.id !== invite.id);
      }
    });
  }

  toggleArchivedLeagues(): void {
    this.showArchivedLeagues = !this.showArchivedLeagues;
    this.leagueService.getLeagues(this.showArchivedLeagues).subscribe({
      next: (leagues) => (this.leagues = leagues)
    });
  }

  openUploadModal(): void {
    this.showUploadModal = true;
  }

  closeUploadModal(): void {
    this.showUploadModal = false;
  }

  onDemoUploaded(demo: Demo): void {
    this.showUploadModal = false;
    if (demo.isPersonal) {
      this.router.navigate(['/profile'], { queryParams: { tab: 'demos' } });
      return;
    }
    if (demo.matchId) {
      this.router.navigate(['/match', demo.matchId]);
      return;
    }
    this.router.navigate(['/demo', demo.id]);
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

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      upcoming: 'Em breve',
      ongoing: 'Em andamento',
      completed: 'Finalizada',
      archived: 'Arquivada',
    };
    return labels[status] || status;
  }
}
