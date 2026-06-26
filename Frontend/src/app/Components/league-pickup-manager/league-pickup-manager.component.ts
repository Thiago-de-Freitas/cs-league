import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LeagueService } from '../../Services/league.service';
import { PickupBalanceMode, PickupLeagueState, PickupPlayer, User } from '../../Models/interfaces';
import { UserSearchPickerComponent } from '../user-search-picker/user-search-picker.component';
import { NotificationService } from '../../Services/notification.service';

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
  @Output() stateChanged = new EventEmitter<void>();

  state: PickupLeagueState | null = null;
  loading = true;
  balancing = false;
  savingSettings = false;

  teamCount = 2;
  playersPerTeam = 5;
  balanceMode: PickupBalanceMode = 'rating';

  readonly balanceModes: { value: PickupBalanceMode; label: string }[] = [
    { value: 'rating', label: 'Rating geral' },
    { value: 'adr', label: 'ADR médio' },
    { value: 'hs_percent', label: '% de headshot' },
    { value: 'position_mix', label: 'Posições (AWP, lurker…)' },
  ];

  constructor(
    private leagueService: LeagueService,
    private notify: NotificationService
  ) {}

  ngOnInit(): void {
    this.loadState();
  }

  get totalPlayers(): number {
    if (!this.state) return 0;
    return this.state.pool.length + this.state.squads.reduce((sum, s) => sum + s.players.length, 0);
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
        this.state = state;
        this.teamCount = state.teamCount;
        this.playersPerTeam = state.playersPerTeam;
        this.balanceMode = state.balanceMode;
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        this.notify.error(err.error?.error || 'Erro ao carregar jogadores da liga.');
      },
    });
  }

  onPlayerPicked(user: User): void {
    if (this.assignedPlayerIds.has(user.id)) {
      this.notify.info('Jogador já está na liga.');
      return;
    }
    this.leagueService.addPickupPlayer(this.leagueId, user.id).subscribe({
      next: (state) => {
        this.state = state;
        this.stateChanged.emit();
        this.notify.success(`${user.displayName} adicionado à liga.`);
      },
      error: (err) => this.notify.error(err.error?.error || 'Erro ao adicionar jogador.'),
    });
  }

  removePlayer(player: PickupPlayer): void {
    this.leagueService.removePickupPlayer(this.leagueId, player.userId).subscribe({
      next: (state) => {
        this.state = state;
        this.stateChanged.emit();
      },
      error: (err) => this.notify.error(err.error?.error || 'Erro ao remover jogador.'),
    });
  }

  movePlayer(player: PickupPlayer, teamId: string): void {
    const resolvedTeamId = teamId === '' ? null : teamId;
    this.leagueService.assignPickupPlayer(this.leagueId, player.userId, resolvedTeamId).subscribe({
      next: (state) => {
        this.state = state;
        this.stateChanged.emit();
      },
      error: (err) => this.notify.error(err.error?.error || 'Erro ao mover jogador.'),
    });
  }

  saveSettings(): void {
    this.savingSettings = true;
    this.leagueService
      .updatePickupSettings(this.leagueId, {
        teamCount: this.teamCount,
        playersPerTeam: this.playersPerTeam,
        balanceMode: this.balanceMode,
      })
      .subscribe({
        next: (state) => {
          this.state = state;
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
        teamCount: this.teamCount,
        playersPerTeam: this.playersPerTeam,
        balanceMode: this.balanceMode,
      })
      .subscribe({
        next: (state) => {
          this.state = state;
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

  formatStat(value: number | null, suffix = ''): string {
    if (value == null) return '—';
    return `${value}${suffix}`;
  }

  trackPlayer(_index: number, player: PickupPlayer): string {
    return player.userId;
  }

  trackSquad(_index: number, squad: { id: string }): string {
    return squad.id;
  }
}
