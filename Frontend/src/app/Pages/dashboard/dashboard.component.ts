import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError, finalize, timeout } from 'rxjs/operators';
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
import { RANKING_POSITION_OPTIONS, RankingPositionFilter, getPlayerPositionLabel } from '../../Utils/player-positions';

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
  loadError = '';
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
  rankingPosition = '';
  readonly rankingPositionOptions = RANKING_POSITION_OPTIONS;
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
    this.loadError = '';
    const requestTimeoutMs = 60_000;
    const safe = <T>(label: string, fallback: T) =>
      (source: import('rxjs').Observable<T>) =>
        source.pipe(
          timeout(requestTimeoutMs),
          catchError(() => {
            this.loadError = `Não foi possível carregar ${label}. Verifique sua conexão e tente novamente.`;
            return of(fallback);
          })
        );

    const leagueId = this.rankingLeagueId || undefined;
    const position = (this.rankingPosition || undefined) as RankingPositionFilter | undefined;
    this.rankingsLoading = true;

    forkJoin({
      leagues: this.leagueService.getLeagues(this.showArchivedLeagues).pipe(safe('ligas', [] as League[])),
      openLeagues: this.leagueService.getOpenLeagues().pipe(safe('ligas abertas', [] as League[])),
      teams: this.teamService.getTeams().pipe(safe('times', [] as Team[])),
      invites: this.teamService.getPendingInvites().pipe(safe('convites', [] as TeamInvite[])),
      playerRankings: this.rankingsService.getPlayerRankings({ leagueId, position }).pipe(safe('ranking de jogadores', [] as PlayerRankingEntry[])),
      teamRankings: this.rankingsService.getTeamRankings().pipe(safe('ranking de times', [] as TeamRankingEntry[])),
    })
      .pipe(finalize(() => {
        this.loading = false;
        this.rankingsLoading = false;
      }))
      .subscribe({
        next: ({ leagues, openLeagues, teams, invites, playerRankings, teamRankings }) => {
          this.leagues = leagues;
          const myIds = new Set(leagues.map((l) => l.id));
          this.openLeagues = openLeagues.filter((l) => !myIds.has(l.id));
          this.teams = teams;
          this.pendingInvites = invites;
          this.playerRankings = playerRankings;
          this.teamRankings = teamRankings;
        },
      });
  }

  loadRankings(): void {
    this.rankingsLoading = true;
    const leagueId = this.rankingLeagueId || undefined;
    const position = (this.rankingPosition || undefined) as RankingPositionFilter | undefined;
    forkJoin({
      playerRankings: this.rankingsService.getPlayerRankings({ leagueId, position }),
      teamRankings: this.rankingsService.getTeamRankings(),
    })
      .pipe(finalize(() => (this.rankingsLoading = false)))
      .subscribe({
        next: ({ playerRankings, teamRankings }) => {
          this.playerRankings = playerRankings;
          this.teamRankings = teamRankings;
        },
        error: () => {
          this.playerRankings = [];
          this.teamRankings = [];
        },
      });
  }

  onRankingLeagueChange(): void {
    this.loadRankings();
  }

  onRankingPositionChange(): void {
    this.loadRankings();
  }

  get rankingPlayersTitle(): string {
    if (!this.rankingPosition) return 'Top Jogadores';
    const option = this.rankingPositionOptions.find((item) => item.id === this.rankingPosition);
    return `Top ${option?.label ?? 'Jogadores'}`;
  }

  get rankingPlayersSubtitle(): string {
    if (!this.rankingPosition) {
      return 'ADR médio em jogos de ligas (demos oficiais das partidas)';
    }
    const option = this.rankingPositionOptions.find((item) => item.id === this.rankingPosition);
    return `Ranking de ${option?.label ?? 'posição'} com base no ADR médio em jogos de ligas`;
  }

  getPlayerProfileLink(player: PlayerRankingEntry): string[] | null {
    if (!player.steamId?.trim()) return null;
    return ['/player', player.steamId];
  }

  getPlayerLabel(player: PlayerRankingEntry): string {
    return player.displayName || player.playerName;
  }

  getPlayerPositionBadge(player: PlayerRankingEntry): string {
    return player.positionLabel || getPlayerPositionLabel(player.position);
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
    this.leagueService.getLeagues(this.showArchivedLeagues).subscribe({
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
