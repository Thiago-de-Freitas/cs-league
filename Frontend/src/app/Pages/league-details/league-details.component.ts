import { Component, OnInit } from '@angular/core';
import { CommonModule, NgIf, DatePipe } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { League, Team, Match } from '../../Models/interfaces';
import { LeagueService } from '../../Services/league.service';
import { TeamService } from '../../Services/team.service';
import { AuthService } from '../../Services/auth.service';
import { MatchService } from '../../Services/match.service';
import { LeagueTeamsTableComponent } from './league-teams-table.component';
import { LeagueBracketComponent, BracketSeedAssignEvent } from '../../Components/league-bracket/league-bracket.component';
import { LeagueGroupsComponent } from '../../Components/league-groups/league-groups.component';
import { LeagueGroupsPreviewComponent } from '../../Components/league-groups-preview/league-groups-preview.component';
import { ConfirmModalComponent } from '../../Components/confirm-modal/confirm-modal.component';
import { NotificationService } from '../../Services/notification.service';
import { getFairBracketSize, formatTeamCapacity, MAX_LEAGUE_TEAMS, MIN_LEAGUE_TEAMS } from '../../Utils/bracket.util';
import { buildGroupPreviewPlans, countRoundRobinMatches } from '../../Utils/group.util';
import { CS2_MAPS } from '../../Utils/maps';

interface ConfirmConfig {
  title: string;
  subtitle?: string;
  message: string;
  highlight?: string;
  highlightLabel?: string;
  hint?: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
}

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
    LeagueGroupsComponent,
    LeagueGroupsPreviewComponent,
    ConfirmModalComponent,
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
  selectedTeamIds: string[] = [];
  addingTeams = false;
  availableTeams: Pick<Team, 'id' | 'name' | 'tag'>[] = [];
  bracketSizes = [] as number[];
  editMaxTeams = false;
  newMaxTeams: number | null = null;
  minTeams = MIN_LEAGUE_TEAMS;
  maxTeamsLimit = MAX_LEAGUE_TEAMS;
  generatingBracket = false;
  generatingGroups = false;
  deletingLeague = false;
  archivingLeague = false;
  unarchivingLeague = false;
  confirmConfig: ConfirmConfig | null = null;
  confirmLoading = false;
  resultModalMatch: Match | null = null;
  resultModalWinnerId = '';
  resultModalMap = '';
  resultModalLoading = false;
  showPlayoffReadyModal = false;
  cs2Maps = CS2_MAPS;
  myOwnedTeams: Pick<Team, 'id' | 'name' | 'tag' | 'ownerId'>[] = [];
  registerTeamId = '';
  registeringTeam = false;
  togglingRegistration = false;
  activeConfrontosTab: 'groups' | 'league' | 'bracket' = 'groups';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private leagueService: LeagueService,
    private teamService: TeamService,
    private matchService: MatchService,
    private authService: AuthService,
    private notify: NotificationService
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
        this.newMaxTeams = league.maxTeams ?? null;
        this.isAdmin = this.authService.isLeagueOwner(league.ownerId || '');
        this.syncConfrontosTab();
        this.loadMyTeamsForRegistration();
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
    if (this.league.maxTeams == null) return false;
    return this.league.teams.length >= this.league.maxTeams;
  }

  get teamCapacityLabel(): string {
    if (!this.league) return '';
    return formatTeamCapacity(this.league.teams.length, this.league.maxTeams);
  }

  get previewBracketSize(): number {
    if (!this.league) return MIN_LEAGUE_TEAMS;
    return this.league.effectiveBracketSize ?? getFairBracketSize(this.league.teams.length);
  }

  get isArchived(): boolean {
    return this.league?.status === 'archived';
  }

  get allMatchesCompleted(): boolean {
    const matches = this.league?.matches || [];
    if (matches.length === 0) return false;
    return matches.every((m) => m.status === 'completed');
  }

  get canArchive(): boolean {
    return this.isAdmin && !this.isArchived && this.allMatchesCompleted;
  }

  get remainingSlots(): number | null {
    if (!this.league) return null;
    if (this.league.maxTeams == null) return null;
    return Math.max(0, this.league.maxTeams - this.league.teams.length);
  }

  get selectionOverLimit(): boolean {
    if (this.remainingSlots == null) return false;
    return this.selectedTeamIds.length > this.remainingSlots;
  }

  get canSubmitTeamSelection(): boolean {
    if (this.selectedTeamIds.length === 0) return false;
    if (this.selectionOverLimit) return false;
    if (this.remainingSlots != null && this.remainingSlots <= 0) return false;
    return true;
  }

  get hasTournamentStarted(): boolean {
    if (this.isGroupStageFormat) return this.hasGroupPhaseGenerated;
    return this.hasBracketGenerated;
  }

  get isRegistrationOpen(): boolean {
    return !!this.league?.registrationOpen
      && this.league?.status === 'upcoming'
      && !this.hasTournamentStarted
      && !this.teamsAtCapacity;
  }

  get registerableTeams(): Pick<Team, 'id' | 'name' | 'tag'>[] {
    if (!this.league) return [];
    const inLeague = new Set(this.league.teams.map((t) => t.id));
    return this.myOwnedTeams.filter((t) => !inLeague.has(t.id));
  }

  get canShowPlayerRegistration(): boolean {
    return !this.isAdmin && this.isRegistrationOpen;
  }

  private loadMyTeamsForRegistration(): void {
    const userId = this.authService.currentUser?.id;
    if (!userId) {
      this.myOwnedTeams = [];
      return;
    }
    this.teamService.getTeams().subscribe({
      next: (teams) => {
        this.myOwnedTeams = teams
          .filter((t) => t.ownerId === userId)
          .map((t) => ({ id: t.id, name: t.name, tag: t.tag, ownerId: t.ownerId }));
        if (this.registerableTeams.length === 1) {
          this.registerTeamId = this.registerableTeams[0].id;
        }
      },
      error: () => (this.myOwnedTeams = []),
    });
  }

  registerMyTeam(): void {
    if (!this.leagueId || !this.registerTeamId) return;
    this.registeringTeam = true;
    this.leagueService.registerTeamInLeague(this.leagueId, this.registerTeamId).subscribe({
      next: (league) => {
        this.league = league;
        this.registeringTeam = false;
        this.registerTeamId = '';
        this.loadMyTeamsForRegistration();
        this.notify.success('Time inscrito na liga com sucesso!');
      },
      error: (err) => {
        this.registeringTeam = false;
        this.apiError(err, 'Erro ao inscrever time na liga');
      },
    });
  }

  toggleRegistrationOpen(event: Event): void {
    if (!this.leagueId || !this.league || this.hasTournamentStarted) return;
    const next = (event.target as HTMLInputElement).checked;
    this.togglingRegistration = true;
    this.leagueService.updateLeague(this.leagueId, { registrationOpen: next }).subscribe({
      next: (league) => {
        this.league = league;
        this.togglingRegistration = false;
        this.notify.success(next ? 'Inscrições abertas para outros jogadores.' : 'Inscrições fechadas.');
      },
      error: (err) => {
        this.togglingRegistration = false;
        this.apiError(err, 'Erro ao atualizar inscrições');
      },
    });
  }

  private apiError(err: unknown, fallback: string): void {
    const msg = (err as { error?: { error?: string } })?.error?.error || fallback;
    this.notify.error(msg);
  }

  get isGroupStageFormat(): boolean {
    return this.league?.format === 'group_stage';
  }

  get isSingleGroupFormat(): boolean {
    return this.isGroupStageFormat && (this.league?.groupCount ?? 2) === 1;
  }

  get isMultiGroupFormat(): boolean {
    return this.isGroupStageFormat && (this.league?.groupCount ?? 2) > 1;
  }

  get minTeamsForGroupPhase(): number {
    return this.isSingleGroupFormat ? 3 : 4;
  }

  get groupPhaseSectionTitle(): string {
    if (this.isSingleGroupFormat) return 'Todos contra todos';
    return 'Fase de grupos';
  }

  get formatBadgeLabel(): string {
    if (!this.isGroupStageFormat) return '';
    return this.isSingleGroupFormat ? 'Grupo único' : 'Vários grupos';
  }

  /** Jogos no turno único: cada time enfrenta todos os outros 1 vez */
  get expectedRoundRobinMatches(): number {
    const n = this.league?.teams.length ?? 0;
    return countRoundRobinMatches(n);
  }

  get groupPreviewPlans() {
    if (!this.league || !this.isGroupStageFormat || this.hasGroupPhaseGenerated) return [];
    const teams = this.league.teams.map((t) => ({
      id: t.id,
      name: t.name,
      tag: t.tag,
      wins: t.wins,
      losses: t.losses,
      points: t.points,
      seed: t.seed,
    }));
    return buildGroupPreviewPlans(teams, this.league.groupCount ?? 2);
  }

  get showGroupPreview(): boolean {
    return this.isGroupStageFormat && !this.hasGroupPhaseGenerated && this.groupPreviewPlans.length > 0;
  }

  get previewMatchTotal(): number {
    return this.groupPreviewPlans.reduce((sum, p) => sum + p.matchCount, 0);
  }

  get multiGroupPreviewLabel(): string {
    if (!this.groupPreviewPlans.length) return '—';
    return `${this.previewMatchTotal} jogos previstos`;
  }

  get confrontosTabs(): { id: 'groups' | 'league'; label: string; disabled: boolean; badge?: string }[] {
    if (!this.isGroupStageFormat) return [];
    const previewTotal = this.previewMatchTotal;
    return [
      {
        id: 'groups',
        label: this.isSingleGroupFormat ? 'Todos contra todos' : 'Grupos',
        disabled: false,
        badge: this.hasGroupPhaseGenerated
          ? `${this.groupMatches.length} jogos`
          : this.showGroupPreview
            ? `${previewTotal} previstos`
            : undefined,
      },
      {
        id: 'league',
        label: 'Fase de liga',
        disabled: !this.hasPlayoffBracket,
        badge: this.hasPlayoffBracket ? `${this.playoffMatches.length} jogos` : undefined,
      },
    ];
  }

  get pendingPlayoffMatches(): Match[] {
    return this.playoffMatches.filter(
      (m) => m.status !== 'completed' && m.team1?.id && m.team2?.id
    );
  }

  /** Times com seed definido (classificados) para exibir o mata-mata da fase de liga */
  get playoffBracketTeams(): Team[] {
    if (!this.league) return [];
    const seeded = this.league.teams.filter((t) => t.seed != null && t.seed > 0);
    if (seeded.length >= 2) {
      return [...seeded].sort((a, b) => (a.seed ?? 0) - (b.seed ?? 0));
    }
    return this.league.teams;
  }

  setConfrontosTab(tab: 'groups' | 'league' | 'bracket'): void {
    if (tab === 'league' && !this.hasPlayoffBracket) return;
    this.activeConfrontosTab = tab;
  }

  private syncConfrontosTab(): void {
    if (!this.league) return;
    if (!this.isGroupStageFormat) {
      this.activeConfrontosTab = 'bracket';
      return;
    }
    if (this.hasPlayoffBracket && this.groupPhaseComplete) {
      this.activeConfrontosTab = 'league';
      return;
    }
    this.activeConfrontosTab = 'groups';
  }

  get hasGroupPhaseGenerated(): boolean {
    return !!this.league?.groupPhaseGenerated;
  }

  get hasPlayoffBracket(): boolean {
    if (this.league?.playoffGenerated != null) return this.league.playoffGenerated;
    const matches = this.league?.matches || [];
    return matches.some((m) => m.phase === 'playoff' && (m.round ?? 0) > 0);
  }

  get groupPhaseComplete(): boolean {
    return !!this.league?.groupPhaseComplete;
  }

  get canGenerateGroups(): boolean {
    return (
      this.isAdmin &&
      !this.isArchived &&
      this.isGroupStageFormat &&
      !this.hasGroupPhaseGenerated &&
      (this.league?.teams.length ?? 0) >= this.minTeamsForGroupPhase
    );
  }

  get canGenerateLeaguePhase(): boolean {
    return (
      this.isAdmin &&
      !this.isArchived &&
      this.isGroupStageFormat &&
      this.hasGroupPhaseGenerated &&
      this.groupPhaseComplete &&
      !this.hasPlayoffBracket
    );
  }

  get playoffMatches(): Match[] {
    return (this.league?.matches || []).filter((m) => m.phase === 'playoff' || (!m.phase && (m.round ?? 0) > 0));
  }

  get groupMatches(): Match[] {
    return (this.league?.matches || []).filter((m) => m.phase === 'group');
  }

  get hasBracketGenerated(): boolean {
    if (this.isGroupStageFormat) return this.hasPlayoffBracket;
    const matches = this.league?.matches || [];
    return matches.some((m) => m.round != null && m.round > 0);
  }

  onBracketSeedAssign(event: BracketSeedAssignEvent): void {
    if (!this.leagueId || !this.league || this.hasTournamentStarted) return;

    const teams = this.league.teams.map((t) => ({ ...t }));

    if (!event.teamId) {
      const holder = teams.find((t) => t.seed === event.seed);
      if (!holder) return;
      const usedSeeds = new Set(teams.map((t) => t.seed).filter((s): s is number => s != null));
      let next = 1;
      while (usedSeeds.has(next) || next === event.seed) next++;
      holder.seed = next;
      this.persistTeamSeeds(teams);
      return;
    }

    const target = teams.find((t) => t.id === event.teamId);
    const holder = teams.find((t) => t.seed === event.seed);
    if (!target) return;

    const previousSeed = target.seed;
    target.seed = event.seed;
    if (holder && holder.id !== event.teamId) {
      holder.seed = previousSeed;
    }

    this.persistTeamSeeds(teams);
  }

  private persistTeamSeeds(teams: Team[]): void {
    if (!this.leagueId) return;
    const payload = teams
      .filter((t) => t.seed != null)
      .map((t) => ({ teamId: t.id, seed: t.seed! }));
    this.leagueService.updateTeamsOrder(this.leagueId, payload).subscribe({
      next: () => this.fetchLeagueDetails(this.leagueId!),
      error: (err) => this.apiError(err, 'Erro ao atualizar chaveamento'),
    });
  }

  updateMaxTeams(): void {
    if (!this.leagueId) return;
    const cap = this.newMaxTeams;
    if (cap != null && (!Number.isInteger(cap) || cap < MIN_LEAGUE_TEAMS || cap > MAX_LEAGUE_TEAMS)) {
      this.notify.warning(`Use entre ${MIN_LEAGUE_TEAMS} e ${MAX_LEAGUE_TEAMS} ou deixe ilimitado.`, 'Limite inválido');
      return;
    }
    this.leagueService.updateLeague(this.leagueId, { maxTeams: cap }).subscribe({
      next: (league) => {
        this.league = league;
        this.editMaxTeams = false;
      },
      error: (err) => this.apiError(err, 'Erro ao atualizar limite de times')
    });
  }

  generateBracket(): void {
    if (!this.leagueId) return;
    this.generatingBracket = true;
    this.leagueService.generateBracket(this.leagueId).subscribe({
      next: (league) => {
        this.league = league;
        this.generatingBracket = false;
        this.syncConfrontosTab();
        this.notify.success(this.isGroupStageFormat ? 'Fase de liga gerada com sucesso!' : 'Chaveamento gerado com sucesso!');
      },
      error: (err) => {
        this.generatingBracket = false;
        this.apiError(err, this.isGroupStageFormat ? 'Erro ao gerar fase de liga' : 'Erro ao gerar chaveamento');
      }
    });
  }

  generateGroups(): void {
    if (!this.leagueId) return;
    this.generatingGroups = true;
    this.leagueService.generateGroups(this.leagueId).subscribe({
      next: (league) => {
        this.league = league;
        this.generatingGroups = false;
        this.syncConfrontosTab();
        this.notify.success(this.isSingleGroupFormat ? 'Confrontos gerados com sucesso!' : 'Fase de grupos gerada com sucesso!');
      },
      error: (err) => {
        this.generatingGroups = false;
        this.apiError(err, 'Erro ao gerar fase de grupos');
      }
    });
  }

  onGroupRegisterResult(event: { match: Match; winnerId: string }): void {
    if (!this.leagueId) return;
    this.matchService.registerResult(event.match.id, event.winnerId).subscribe({
      next: (res) => {
        this.fetchLeagueDetails(this.leagueId!);
        this.notify.success('Resultado registrado.');
        if (res.groupPhaseJustCompleted && this.isAdmin) {
          this.showPlayoffReadyModal = true;
        }
      },
      error: (err) => this.apiError(err, 'Erro ao registrar resultado'),
    });
  }

  closePlayoffReadyModal(): void {
    if (this.generatingBracket) return;
    this.showPlayoffReadyModal = false;
  }

  generatePlayoffFromModal(): void {
    this.showPlayoffReadyModal = false;
    this.generateBracket();
  }

  openAddTeam(): void {
    if (!this.leagueId) return;
    if (this.teamsAtCapacity) {
      this.notify.warning(
        `Esta liga já atingiu o limite de ${this.league?.maxTeams} times.`,
        'Limite atingido',
        { highlight: `${this.league?.teams.length} / ${this.league?.maxTeams} vagas` }
      );
      return;
    }
    this.showAddTeam = true;
    this.selectedTeamIds = [];
    this.availableTeams = [];
    this.leagueService.getAvailableTeams(this.leagueId).subscribe({
      next: (teams) => {
        this.availableTeams = teams;
      },
      error: () => {
        this.notify.error('Erro ao carregar times disponíveis.');
        this.showAddTeam = false;
      }
    });
  }

  addTeamsToLeague(): void {
    if (!this.leagueId || this.selectedTeamIds.length === 0) return;

    if (this.remainingSlots != null && this.remainingSlots <= 0) {
      this.notify.warning('Limite de times da liga atingido.', 'Sem vagas');
      return;
    }

    if (this.selectionOverLimit) {
      this.notify.warning(
        `Você selecionou ${this.selectedTeamIds.length} time(s), mas só há ${this.remainingSlots} vaga(s) disponível(is).`,
        'Seleção excede o limite',
        {
          hint: 'Desmarque alguns times ou altere o limite da liga.',
          highlight: `${this.selectedTeamIds.length} selecionados · ${this.remainingSlots} vaga(s)`,
        }
      );
      return;
    }

    this.addingTeams = true;
    const count = this.selectedTeamIds.length;
    this.leagueService.addTeamsToLeague(this.leagueId, this.selectedTeamIds).subscribe({
      next: (league) => {
        this.league = league;
        this.showAddTeam = false;
        this.selectedTeamIds = [];
        this.addingTeams = false;
        this.notify.success(
          `${count} time(s) adicionado(s) à liga.`,
          'Times adicionados'
        );
      },
      error: (err) => {
        this.addingTeams = false;
        this.apiError(err, 'Erro ao adicionar times');
        if (this.leagueId) this.fetchLeagueDetails(this.leagueId);
      }
    });
  }

  cancelAddTeams(): void {
    this.showAddTeam = false;
    this.selectedTeamIds = [];
  }

  registerResult(match: Match, winnerId: string): void {
    this.resultModalMatch = match;
    this.resultModalWinnerId = winnerId;
    this.resultModalMap = match.map || '';
    this.resultModalLoading = false;
  }

  canRegisterResultForMatch(match: Match): boolean {
    if (this.isArchived || match.status === 'completed') return false;
    if (this.isAdmin) return true;
    const user = this.authService.currentUser;
    if (!user) return false;
    const teams = this.league?.teams || [];
    const team1 = teams.find((t) => t.id === match.team1.id);
    const team2 = teams.find((t) => t.id === match.team2.id);
    const isCaptain = (team?: Team) =>
      team?.players?.some((p) => p.id === user.id && p.role === 'CAPTAIN') ?? false;
    return isCaptain(team1) || isCaptain(team2);
  }

  closeResultModal(): void {
    if (this.resultModalLoading) return;
    this.resultModalMatch = null;
    this.resultModalWinnerId = '';
    this.resultModalMap = '';
  }

  confirmResultModal(): void {
    if (!this.resultModalMatch || !this.resultModalWinnerId) return;
    this.resultModalLoading = true;
    const map = this.resultModalMap || undefined;
    this.matchService.registerResult(this.resultModalMatch.id, this.resultModalWinnerId, map).subscribe({
      next: () => {
        this.resultModalLoading = false;
        this.closeResultModal();
        if (this.leagueId) {
          this.fetchLeagueDetails(this.leagueId);
        }
        this.notify.success('Resultado registrado com sucesso.');
      },
      error: (err) => {
        this.resultModalLoading = false;
        this.apiError(err, 'Erro ao registrar resultado');
      }
    });
  }

  get resultWinnerLabel(): string {
    if (!this.resultModalMatch) return '';
    const winner =
      this.resultModalMatch.team1.id === this.resultModalWinnerId
        ? this.resultModalMatch.team1
        : this.resultModalMatch.team2;
    return winner.tag || winner.name;
  }

  onTeamsReordered(teams: Team[]): void {
    if (!this.leagueId || this.hasTournamentStarted) return;
    const payload = teams.map((t, i) => ({ teamId: t.id, seed: i + 1 }));
    this.leagueService.updateTeamsOrder(this.leagueId, payload).subscribe();
  }

  onEditTeam(team: Team): void {
    if (!this.authService.canManageTeam(team)) return;
    this.router.navigate(['/team-details', team.id]);
  }

  onRemoveTeam(teamId: string): void {
    if (!this.leagueId) return;
    const team = this.league?.teams.find((t) => t.id === teamId);
    const teamLabel = team ? `${team.name}${team.tag ? ' [' + team.tag + ']' : ''}` : '';

    this.confirmConfig = {
      title: 'Remover time',
      subtitle: this.league?.name ? `Liga: ${this.league.name}` : '',
      message: 'Este time será removido da classificação e do chaveamento desta liga.',
      highlight: teamLabel,
      highlightLabel: 'Time',
      hint: this.hasBracketGenerated
        ? 'Partidas agendadas deste time serão removidas. Times com jogos em andamento ou finalizados não podem ser excluídos.'
        : 'O time continuará cadastrado no sistema e poderá ser adicionado novamente depois.',
      confirmLabel: 'Remover',
      danger: true,
      onConfirm: () => {
        this.confirmLoading = true;
        this.leagueService.removeTeamFromLeague(this.leagueId!, teamId).subscribe({
          next: (league) => {
            this.league = league;
            this.confirmLoading = false;
            this.confirmConfig = null;
          },
          error: (err) => {
            this.confirmLoading = false;
            this.confirmConfig = null;
            this.apiError(err, 'Erro ao remover time');
          }
        });
      }
    };
  }

  goToMatch(matchId: string): void {
    this.router.navigate(['/match', matchId]);
  }

  deleteLeague(): void {
    if (!this.leagueId) return;
    this.confirmConfig = {
      title: 'Excluir liga',
      message: 'Esta ação é permanente e não pode ser desfeita.',
      highlight: this.league?.name,
      highlightLabel: 'Liga',
      hint: 'Todos os times, partidas e chaveamentos desta liga serão excluídos.',
      confirmLabel: 'Excluir',
      danger: true,
      onConfirm: () => {
        this.confirmLoading = true;
        this.deletingLeague = true;
        this.leagueService.deleteLeague(this.leagueId!).subscribe({
          next: () => this.router.navigate(['/create-league']),
          error: (err) => {
            this.deletingLeague = false;
            this.confirmLoading = false;
            this.confirmConfig = null;
            this.apiError(err, 'Erro ao excluir liga');
          }
        });
      }
    };
  }

  archiveLeague(): void {
    if (!this.leagueId) return;
    this.confirmConfig = {
      title: 'Arquivar liga',
      message: 'A liga deixará de aparecer na página inicial.',
      highlight: this.league?.name,
      highlightLabel: 'Liga',
      hint: 'Você poderá desarquivá-la depois na listagem de ligas.',
      confirmLabel: 'Arquivar',
      onConfirm: () => {
        this.confirmLoading = true;
        this.archivingLeague = true;
        this.leagueService.archiveLeague(this.leagueId!).subscribe({
          next: () => this.router.navigate(['/dashboard']),
          error: (err) => {
            this.archivingLeague = false;
            this.confirmLoading = false;
            this.confirmConfig = null;
            this.apiError(err, 'Erro ao arquivar liga');
          }
        });
      }
    };
  }

  unarchiveLeague(): void {
    if (!this.leagueId) return;
    this.confirmConfig = {
      title: 'Desarquivar liga',
      message: 'A liga voltará a aparecer na página inicial.',
      highlight: this.league?.name,
      highlightLabel: 'Liga',
      confirmLabel: 'Desarquivar',
      onConfirm: () => {
        this.confirmLoading = true;
        this.unarchivingLeague = true;
        this.leagueService.unarchiveLeague(this.leagueId!).subscribe({
          next: () => {
            this.fetchLeagueDetails(this.leagueId!);
            this.unarchivingLeague = false;
            this.confirmLoading = false;
            this.confirmConfig = null;
          },
          error: (err) => {
            this.unarchivingLeague = false;
            this.confirmLoading = false;
            this.confirmConfig = null;
            this.apiError(err, 'Erro ao desarquivar liga');
          }
        });
      }
    };
  }

  onConfirmAction(): void {
    this.confirmConfig?.onConfirm();
  }

  closeConfirm(): void {
    if (!this.confirmLoading) {
      this.confirmConfig = null;
    }
  }

  getMatchLabel(match: Match): string {
    if (match.phase === 'group' && match.groupRound) {
      const group = this.league?.groups?.find((g) => g.id === match.groupId);
      const groupName = group ? `Grupo ${group.name}` : 'Grupo';
      return `${groupName} · R${match.groupRound}`;
    }
    if (match.round) return `R${match.round}`;
    return '';
  }

  getMatchStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      scheduled: 'Agendada',
      in_progress: 'Em andamento',
      completed: 'Finalizada',
      cancelled: 'Cancelada',
    };
    return labels[status] || status;
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
