import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LeagueService } from '../../Services/league.service';
import { PickupLeagueState, PickupPlayer, PickupSquad, User } from '../../Models/interfaces';
import { UserSearchPickerComponent } from '../user-search-picker/user-search-picker.component';
import { NotificationService } from '../../Services/notification.service';
import {
  PICKUP_BALANCE_MODE_OPTIONS,
  PickupBalanceMode,
  formatPickupBalanceModesLabel,
  normalizePickupBalanceModes,
} from '../../Utils/pickup-balance.util';

type SquadDraft = { id: string; name: string; tag: string };

@Component({
  selector: 'app-league-pickup-manager',
  standalone: true,
  imports: [CommonModule, FormsModule, UserSearchPickerComponent],
  templateUrl: './league-pickup-manager.component.html',
  styleUrls: ['./league-pickup-manager.component.css'],
})
export class LeaguePickupManagerComponent implements OnInit {
  @Input({ required: true }) leagueId!: string;
  @Input() disabled = false;
  @Input() hasMatches = false;
  @Output() stateChanged = new EventEmitter<void>();
  @Output() matchStarted = new EventEmitter<string>();

  readonly fixedTeamCount = 2;

  state: PickupLeagueState | null = null;
  loading = true;
  balancing = false;
  savingSettings = false;
  savingSquads = false;
  startingMatch = false;

  playersPerTeam = 5;
  balanceModes: PickupBalanceMode[] = ['rating'];
  squadDrafts: SquadDraft[] = [];
  inviteTeamId = '';

  readonly balanceModeOptions = PICKUP_BALANCE_MODE_OPTIONS;

  constructor(
    private leagueService: LeagueService,
    private notify: NotificationService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadState();
  }

  get balanceModesLabel(): string {
    return formatPickupBalanceModesLabel(this.balanceModes);
  }

  get totalPlayers(): number {
    if (!this.state) return 0;
    return this.state.pool.length + this.state.squads.reduce((sum, s) => sum + s.players.length, 0);
  }

  get canStartMatch(): boolean {
    if (!this.state || this.hasMatches || this.disabled) return false;
    const squads = this.displaySquads;
    if (squads.length < this.fixedTeamCount) return false;
    return squads.every((squad) => squad.players.length > 0);
  }

  get displaySquads(): PickupSquad[] {
    if (!this.state) return [];
    if (this.state.squads.length >= this.fixedTeamCount) {
      return this.state.squads;
    }
    return this.squadDrafts.map((draft, index) => ({
      id: draft.id,
      name: draft.name,
      tag: draft.tag,
      seed: index + 1,
      players: this.state?.squads.find((squad) => squad.id === draft.id)?.players ?? [],
      teamRating: this.state?.squads.find((squad) => squad.id === draft.id)?.teamRating ?? null,
    }));
  }

  get assignedPlayerIds(): Set<string> {
    const ids = new Set<string>();
    if (!this.state) return ids;
    for (const p of this.state.pool) ids.add(p.userId);
    for (const squad of this.state.squads) {
      for (const p of squad.players) ids.add(p.userId);
    }
    return ids;
  }

  loadState(): void {
    this.loading = true;
    this.leagueService.getPickupState(this.leagueId).subscribe({
      next: (state) => {
        this.applyState(state);
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        this.notify.error(err.error?.error || 'Erro ao carregar jogadores da liga.');
      },
    });
  }

  private applyState(state: PickupLeagueState): void {
    this.state = state;
    this.playersPerTeam = state.playersPerTeam;
    this.balanceModes = normalizePickupBalanceModes(state.balanceModes ?? state.balanceMode);
    this.syncSquadDrafts(state.squads);
    if (!this.inviteTeamId && state.squads[0]) {
      this.inviteTeamId = state.squads[0].id;
    }
  }

  private syncSquadDrafts(squads: PickupSquad[]): void {
    const defaults = [
      { id: '', name: 'Time 1', tag: 'T1' },
      { id: '', name: 'Time 2', tag: 'T2' },
    ];

    this.squadDrafts = defaults.map((fallback, index) => {
      const squad = squads[index];
      if (!squad) return { ...fallback };
      return { id: squad.id, name: squad.name, tag: squad.tag };
    });
  }

  isBalanceModeSelected(mode: PickupBalanceMode): boolean {
    return this.balanceModes.includes(mode);
  }

  toggleBalanceMode(mode: PickupBalanceMode, event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.checked) {
      if (!this.balanceModes.includes(mode)) {
        this.balanceModes = [...this.balanceModes, mode];
      }
      return;
    }

    if (this.balanceModes.length <= 1) {
      input.checked = true;
      this.notify.info('Selecione ao menos um critério.');
      return;
    }

    this.balanceModes = this.balanceModes.filter((item) => item !== mode);
  }

  onPlayerPicked(user: User): void {
    if (this.assignedPlayerIds.has(user.id)) {
      this.notify.info('Jogador já está na liga.');
      return;
    }
    const teamId = this.inviteTeamId || null;
    this.leagueService.addPickupPlayer(this.leagueId, user.id, teamId).subscribe({
      next: (state) => {
        this.applyState(state);
        this.stateChanged.emit();
        this.notify.success(`${user.displayName} adicionado à liga.`);
      },
      error: (err) => this.notify.error(err.error?.error || 'Erro ao adicionar jogador.'),
    });
  }

  saveSquads(): void {
    const missingId = this.squadDrafts.some((squad) => !squad.id);
    if (missingId) {
      this.loadState();
      this.notify.info('Carregando times da liga...');
      return;
    }
    if (this.squadDrafts.length !== this.fixedTeamCount) {
      this.notify.error('Configure os dois times da liga.');
      return;
    }
    this.savingSquads = true;
    this.leagueService.updatePickupSquads(this.leagueId, this.squadDrafts).subscribe({
      next: (state) => {
        this.applyState(state);
        this.savingSquads = false;
        this.stateChanged.emit();
        this.notify.success('Times atualizados.');
      },
      error: (err) => {
        this.savingSquads = false;
        this.notify.error(err.error?.error || 'Erro ao salvar times.');
      },
    });
  }

  removePlayer(player: PickupPlayer): void {
    this.leagueService.removePickupPlayer(this.leagueId, player.userId).subscribe({
      next: (state) => {
        this.applyState(state);
        this.stateChanged.emit();
      },
      error: (err) => this.notify.error(err.error?.error || 'Erro ao remover jogador.'),
    });
  }

  movePlayer(player: PickupPlayer, teamId: string): void {
    const resolvedTeamId = teamId === '' ? null : teamId;
    this.leagueService.assignPickupPlayer(this.leagueId, player.userId, resolvedTeamId).subscribe({
      next: (state) => {
        this.applyState(state);
        this.stateChanged.emit();
      },
      error: (err) => this.notify.error(err.error?.error || 'Erro ao mover jogador.'),
    });
  }

  saveSettings(): void {
    this.savingSettings = true;
    this.leagueService
      .updatePickupSettings(this.leagueId, {
        playersPerTeam: this.playersPerTeam,
        balanceModes: this.balanceModes,
      })
      .subscribe({
        next: (state) => {
          this.applyState(state);
          this.savingSettings = false;
          this.notify.success('Configurações salvas.');
        },
        error: (err) => {
          this.savingSettings = false;
          this.notify.error(err.error?.error || 'Erro ao salvar configurações.');
        },
      });
  }

  balanceTeams(): void {
    this.balancing = true;
    this.leagueService
      .balancePickupLeague(this.leagueId, {
        playersPerTeam: this.playersPerTeam,
        balanceModes: this.balanceModes,
      })
      .subscribe({
        next: (state) => {
          this.applyState(state);
          this.balancing = false;
          this.stateChanged.emit();
          this.notify.success('Times balanceados com sucesso!');
        },
        error: (err) => {
          this.balancing = false;
          this.notify.error(err.error?.error || 'Erro ao balancear times.');
        },
      });
  }

  startMatch(): void {
    this.startingMatch = true;
    this.leagueService.startPickupMatch(this.leagueId).subscribe({
      next: (result) => {
        this.applyState(result.state);
        this.startingMatch = false;
        this.stateChanged.emit();
        this.matchStarted.emit(result.matchId);
        this.notify.success('Confronto iniciado!');
        this.router.navigate(['/match', result.matchId]);
      },
      error: (err) => {
        this.startingMatch = false;
        this.notify.error(err.error?.error || 'Erro ao iniciar confronto.');
      },
    });
  }

  formatStat(value: number | null, suffix = ''): string {
    if (value == null) return '—';
    return `${value}${suffix}`;
  }

  trackPlayer(_index: number, player: PickupPlayer): string {
    return player.userId;
  }

  trackSquad(_index: number, squad: PickupSquad | SquadDraft): string {
    return squad.id;
  }
}
