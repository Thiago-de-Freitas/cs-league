import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError, finalize, timeout } from 'rxjs/operators';
import { LeagueService } from '../../Services/league.service';
import { TeamService } from '../../Services/team.service';
import { RankingsService, PLAYER_RANKING_PAGE_SIZE_OPTIONS, PlayerRankingPageSize, PlayerRankingsPage } from '../../Services/rankings.service';
import { AuthService } from '../../Services/auth.service';
import { League, Team, TeamInvite, PlayerRankingEntry, TeamRankingEntry } from '../../Models/interfaces';
import { CreateLeagueModalComponent } from '../../Components/create-league-modal/create-league-modal.component';
import { CreateTeamModalComponent, TeamCreatedEvent } from '../../Components/create-team-modal/create-team-modal.component';
import { formatTeamCapacity } from '../../Utils/bracket.util';
import { RANKING_POSITION_OPTIONS, RankingPositionFilter, getPlayerPositionLabel } from '../../Utils/player-positions';
import { resolveUploadAssetUrl } from '../../Utils/upload-asset.util';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, CreateLeagueModalComponent, CreateTeamModalComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit {
  readonly pageSize = 10;
  leaguesPage = 0;
  teamsPage = 0;
  leagues: League[] = [];
  openLeagues: League[] = [];
  teams: Team[] = [];
  loading = true;
  loadError = '';
  userName = '';
  showCreateLeagueModal = false;
  showCreateTeamModal = false;
  showArchivedLeagues = false;
  pendingInvites: TeamInvite[] = [];
  playerRankings: PlayerRankingEntry[] = [];
  teamRankings: TeamRankingEntry[] = [];
  playerRankingsLoading = true;
  teamRankingsLoading = true;
  rankingLeagueId = '';
  rankingPosition = '';
  rankingPage = 1;
  rankingPageSize: PlayerRankingPageSize = 10;
  rankingIncludePersonal = false;
  rankingTotal = 0;
  rankingTotalPages = 1;
  readonly rankingPositionOptions = RANKING_POSITION_OPTIONS;
  readonly rankingPageSizeOptions = PLAYER_RANKING_PAGE_SIZE_OPTIONS;
  formatTeamCapacity = formatTeamCapacity;
  private brokenRankingLogoIds = new Set<string>();

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
    const rankingQuery = {
      leagueId,
      position,
      page: this.rankingPage,
      pageSize: this.rankingPageSize,
      includePersonal: this.rankingIncludePersonal,
    };
    this.playerRankingsLoading = true;
    this.teamRankingsLoading = true;

    forkJoin({
      leagues: this.leagueService.getLeagues(this.showArchivedLeagues).pipe(safe('ligas', [] as League[])),
      openLeagues: this.leagueService.getOpenLeagues().pipe(safe('ligas abertas', [] as League[])),
      teams: this.teamService.getTeams().pipe(safe('times', [] as Team[])),
      invites: this.teamService.getPendingInvites().pipe(safe('convites', [] as TeamInvite[])),
      playerRankings: this.rankingsService.getPlayerRankings(rankingQuery).pipe(
        safe('ranking de jogadores', { players: [], page: 1, pageSize: 10, total: 0, totalPages: 1 } as PlayerRankingsPage)
      ),
      teamRankings: this.rankingsService.getTeamRankings().pipe(safe('ranking de times', [] as TeamRankingEntry[])),
    })
      .pipe(finalize(() => {
        this.loading = false;
        this.playerRankingsLoading = false;
        this.teamRankingsLoading = false;
      }))
      .subscribe({
        next: ({ leagues, openLeagues, teams, invites, playerRankings, teamRankings }) => {
          this.leagues = leagues;
          this.clampLeaguesPage();
          const myIds = new Set(leagues.map((l) => l.id));
          this.openLeagues = openLeagues.filter((l) => !myIds.has(l.id));
          this.teams = teams;
          this.clampTeamsPage();
          this.pendingInvites = invites;
          this.applyPlayerRankingsPage(playerRankings);
          this.teamRankings = teamRankings;
        },
      });
  }

  loadPlayerRankings(): void {
    this.playerRankingsLoading = true;
    const leagueId = this.rankingLeagueId || undefined;
    const position = (this.rankingPosition || undefined) as RankingPositionFilter | undefined;
    this.rankingsService
      .getPlayerRankings({
        leagueId,
        position,
        page: this.rankingPage,
        pageSize: this.rankingPageSize,
        includePersonal: this.rankingIncludePersonal,
      })
      .pipe(
        finalize(() => (this.playerRankingsLoading = false)),
        catchError(() => {
          this.playerRankings = [];
          this.rankingTotal = 0;
          this.rankingTotalPages = 1;
          return of({ players: [], page: 1, pageSize: this.rankingPageSize, total: 0, totalPages: 1 });
        })
      )
      .subscribe((page) => {
        this.applyPlayerRankingsPage(page);
      });
  }

  private applyPlayerRankingsPage(page: {
    players: PlayerRankingEntry[];
    page?: number;
    pageSize?: number;
    total?: number;
    totalPages?: number;
  }): void {
    this.playerRankings = page.players;
    this.rankingPage = page.page ?? this.rankingPage;
    this.rankingPageSize = (page.pageSize ?? this.rankingPageSize) as PlayerRankingPageSize;
    this.rankingTotal = page.total ?? 0;
    this.rankingTotalPages = page.totalPages ?? 1;
  }

  onRankingLeagueChange(): void {
    this.rankingPage = 1;
    this.loadPlayerRankings();
  }

  onRankingPositionChange(): void {
    this.rankingPage = 1;
    this.loadPlayerRankings();
  }

  onRankingPageSizeChange(): void {
    this.rankingPage = 1;
    this.loadPlayerRankings();
  }

  onRankingIncludePersonalChange(): void {
    this.rankingPage = 1;
    this.rankingsService.invalidateAll();
    this.loadPlayerRankings();
  }

  goToRankingPage(page: number): void {
    if (page < 1 || page > this.rankingTotalPages || page === this.rankingPage || this.playerRankingsLoading) {
      return;
    }
    this.rankingPage = page;
    this.loadPlayerRankings();
  }

  get rankingRangeLabel(): string {
    if (this.rankingTotal === 0) return 'Nenhum jogador';
    const start = (this.rankingPage - 1) * this.rankingPageSize + 1;
    const end = Math.min(this.rankingPage * this.rankingPageSize, this.rankingTotal);
    return `${start}–${end} de ${this.rankingTotal}`;
  }

  get rankingPageLabel(): string {
    return `${this.rankingPage} de ${this.rankingTotalPages}`;
  }

  get showRankingPagination(): boolean {
    return !this.playerRankingsLoading && this.rankingTotalPages > 1;
  }

  get rankingPlayersTitle(): string {
    if (!this.rankingPosition) return 'Top Jogadores';
    const option = this.rankingPositionOptions.find((item) => item.id === this.rankingPosition);
    return `Top ${option?.label ?? 'Jogadores'}`;
  }

  get rankingPlayersSubtitle(): string {
    const personalSuffix = this.rankingIncludePersonal
      ? ' — inclui demos pessoais enviadas no perfil'
      : ' — apenas demos oficiais de partidas de ligas';

    if (!this.rankingPosition) {
      return `ADR médio nos jogos considerados${personalSuffix}`;
    }
    const option = this.rankingPositionOptions.find((item) => item.id === this.rankingPosition);
    return `Ranking de ${option?.label ?? 'posição'} por ADR médio${personalSuffix}`;
  }

  getPlayerProfileLink(player: PlayerRankingEntry): string[] | null {
    if (player.userId) return ['/users', player.userId];
    if (!player.steamId?.trim()) return null;
    return ['/player', player.steamId];
  }

  getPlayerLabel(player: PlayerRankingEntry): string {
    return player.displayName || player.playerName;
  }

  getPlayerPositionBadge(player: PlayerRankingEntry): string {
    return player.positionLabel || getPlayerPositionLabel(player.position);
  }

  teamRankingLogoSrc(team: TeamRankingEntry): string | null {
    if (!team.logoUrl || this.brokenRankingLogoIds.has(team.teamId)) return null;
    return resolveUploadAssetUrl(team.logoUrl);
  }

  onTeamRankingLogoError(teamId: string): void {
    this.brokenRankingLogoIds.add(teamId);
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
          next: (teams) => {
            this.teams = teams;
            this.clampTeamsPage();
          },
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
    this.leaguesPage = 0;
    this.leagueService.getLeagues(this.showArchivedLeagues).subscribe({
      next: (leagues) => {
        this.leagues = leagues;
        this.clampLeaguesPage();
      },
    });
  }

  get paginatedLeagues(): League[] {
    const start = this.leaguesPage * this.pageSize;
    return this.leagues.slice(start, start + this.pageSize);
  }

  get paginatedTeams(): Team[] {
    const start = this.teamsPage * this.pageSize;
    return this.teams.slice(start, start + this.pageSize);
  }

  get leaguesTotalPages(): number {
    return Math.max(1, Math.ceil(this.leagues.length / this.pageSize));
  }

  get teamsTotalPages(): number {
    return Math.max(1, Math.ceil(this.teams.length / this.pageSize));
  }

  get showLeaguesPagination(): boolean {
    return this.leagues.length > this.pageSize;
  }

  get showTeamsPagination(): boolean {
    return this.teams.length > this.pageSize;
  }

  get leaguesPageLabel(): string {
    return `${this.leaguesPage + 1} de ${this.leaguesTotalPages}`;
  }

  get teamsPageLabel(): string {
    return `${this.teamsPage + 1} de ${this.teamsTotalPages}`;
  }

  goToLeaguesPage(page: number): void {
    this.leaguesPage = Math.min(Math.max(0, page), this.leaguesTotalPages - 1);
  }

  goToTeamsPage(page: number): void {
    this.teamsPage = Math.min(Math.max(0, page), this.teamsTotalPages - 1);
  }

  private clampLeaguesPage(): void {
    const maxPage = Math.max(0, this.leaguesTotalPages - 1);
    if (this.leaguesPage > maxPage) this.leaguesPage = maxPage;
  }

  private clampTeamsPage(): void {
    const maxPage = Math.max(0, this.teamsTotalPages - 1);
    if (this.teamsPage > maxPage) this.teamsPage = maxPage;
  }

  openCreateLeagueModal(): void {
    this.showCreateLeagueModal = true;
  }

  closeCreateLeagueModal(): void {
    this.showCreateLeagueModal = false;
  }

  onLeagueCreated(league: League): void {
    this.showCreateLeagueModal = false;
    this.leaguesPage = 0;
    this.leagueService.getLeagues(this.showArchivedLeagues).subscribe({
      next: (leagues) => {
        this.leagues = leagues;
        this.clampLeaguesPage();
      },
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
    this.teamsPage = 0;
    this.teamService.getTeams().subscribe({
      next: (teams) => {
        this.teams = teams;
        this.clampTeamsPage();
      },
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
