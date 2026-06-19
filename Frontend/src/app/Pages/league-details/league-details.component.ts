import { Component, OnInit } from '@angular/core';
import { CommonModule, NgIf, DatePipe } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { League, Team, Match } from '../../Models/interfaces';
import { LeagueService } from '../../Services/league.service';
import { AuthService } from '../../Services/auth.service';
import { MatchService } from '../../Services/match.service';
import { LeagueTeamsTableComponent } from './league-teams-table.component';
import { LeagueBracketComponent, BracketSeedAssignEvent } from '../../Components/league-bracket/league-bracket.component';
import { ConfirmModalComponent } from '../../Components/confirm-modal/confirm-modal.component';
import { NotificationService } from '../../Services/notification.service';
import { ALLOWED_BRACKET_SIZES } from '../../Utils/bracket.util';

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
  bracketSizes = ALLOWED_BRACKET_SIZES;
  editMaxTeams = false;
  newMaxTeams = 8;
  generatingBracket = false;
  deletingLeague = false;
  archivingLeague = false;
  unarchivingLeague = false;
  confirmConfig: ConfirmConfig | null = null;
  confirmLoading = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private leagueService: LeagueService,
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

  get remainingSlots(): number {
    if (!this.league) return 0;
    return (this.league.maxTeams || 8) - this.league.teams.length;
  }

  get selectionOverLimit(): boolean {
    return this.selectedTeamIds.length > this.remainingSlots;
  }

  get canSubmitTeamSelection(): boolean {
    return this.selectedTeamIds.length > 0 && !this.selectionOverLimit && this.remainingSlots > 0;
  }

  private apiError(err: unknown, fallback: string): void {
    const msg = (err as { error?: { error?: string } })?.error?.error || fallback;
    this.notify.error(msg);
  }

  get hasBracketGenerated(): boolean {
    const matches = this.league?.matches || [];
    return matches.some((m) => m.round != null && m.round > 0);
  }

  onBracketSeedAssign(event: BracketSeedAssignEvent): void {
    if (!this.leagueId || !this.league || this.hasBracketGenerated) return;

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
    this.leagueService.updateLeague(this.leagueId, { maxTeams: Number(this.newMaxTeams) }).subscribe({
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
      },
      error: (err) => {
        this.generatingBracket = false;
        this.apiError(err, 'Erro ao gerar chaveamento');
      }
    });
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

    if (this.remainingSlots <= 0) {
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
    this.matchService.registerResult(match.id, winnerId).subscribe({
      next: () => {
        if (this.leagueId) this.fetchLeagueDetails(this.leagueId);
      },
      error: (err) => this.apiError(err, 'Erro ao registrar resultado')
    });
  }

  onTeamsReordered(teams: Team[]): void {
    if (!this.leagueId || this.hasBracketGenerated) return;
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
      hint: 'O time continuará cadastrado no sistema e poderá ser adicionado novamente depois.',
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
