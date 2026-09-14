import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { LeagueService } from '../../Services/league.service';
import { GamesService, type GameConfigApi } from '../../Services/games.service';
import { League } from '../../Models/interfaces';
import { MAX_LEAGUE_TEAMS, MIN_LEAGUE_TEAMS } from '../../Utils/bracket.util';
import {
  buildMapSettingsPayload,
  getMapSeriesScopeHint,
  showMapSeriesOptions,
  validateLeagueMapSettings,
  type LeagueSeriesFormat,
} from '../../Utils/series-map.util';
import { LeagueSeriesMapSettingsComponent } from '../league-series-map-settings/league-series-map-settings.component';
import { getDefaultMapPoolForGame, getMapsForGame } from '../../Utils/game-maps.util';
import {
  PICKUP_BALANCE_MODE_OPTIONS,
  PickupBalanceMode,
} from '../../Utils/pickup-balance.util';

@Component({
  selector: 'app-create-league-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, LeagueSeriesMapSettingsComponent],
  templateUrl: './create-league-modal.component.html',
  styleUrls: ['./create-league-modal.component.css']
})
export class CreateLeagueModalComponent implements OnInit {
  @Output() closed = new EventEmitter<void>();
  @Output() created = new EventEmitter<League>();

  form: FormGroup;
  loading = false;
  errorMessage = '';
  minTeams = MIN_LEAGUE_TEAMS;
  maxTeamsLimit = MAX_LEAGUE_TEAMS;
  games: GameConfigApi[] = [];
  selectedGame: GameConfigApi | null = null;
  mapPool: string[] = getDefaultMapPoolForGame('cs2');
  seriesFormat: LeagueSeriesFormat = 'bo1';
  mapVetoEnabled = true;
  pickupBalanceModes: PickupBalanceMode[] = ['rating'];
  readonly balanceModeOptions = PICKUP_BALANCE_MODE_OPTIONS;

  constructor(
    private fb: FormBuilder,
    private leagueService: LeagueService,
    private gamesService: GamesService
  ) {
    this.form = this.fb.group({
      game: ['cs2', Validators.required],
      leagueName: ['', Validators.required],
      description: ['', Validators.maxLength(500)],
      format: ['single_elimination'],
      groupCount: [2],
      advancePerGroup: [2],
      homeAndAway: [false],
      matchesPerMatchDay: [2],
      maxTeams: [''],
      pickupPlayersPerTeam: [5],
      registrationOpen: [false],
    });
  }

  ngOnInit(): void {
    this.gamesService.listGames().subscribe({
      next: (games) => {
        this.games = games;
        this.onGameChange(this.form.get('game')?.value ?? 'cs2');
      },
    });
    this.form.get('game')?.valueChanges.subscribe((game) => this.onGameChange(game));
  }

  get gameMaps() {
    return getMapsForGame(this.form.get('game')?.value ?? 'cs2');
  }

  get availableSeriesFormats(): LeagueSeriesFormat[] {
    return (this.selectedGame?.seriesFormats ?? ['bo1', 'bo3']) as LeagueSeriesFormat[];
  }

  get selectedGameTagline(): string {
    return this.selectedGame?.tagline ?? 'Competições de Counter-Strike 2';
  }

  onGameChange(gameId: string): void {
    this.selectedGame = this.games.find((g) => g.id === gameId) ?? null;
    this.mapPool = getDefaultMapPoolForGame(gameId);
    this.seriesFormat = (this.selectedGame?.seriesFormats[0] ?? 'bo1') as LeagueSeriesFormat;
    this.mapVetoEnabled = this.selectedGame?.supportsMapVeto ?? true;

    const formatControl = this.form.get('format');
    if (gameId === 'pubg' && formatControl) {
      formatControl.setValue('points_race');
    } else if (formatControl?.value === 'points_race') {
      formatControl.setValue('single_elimination');
    }

    const perTeam = this.selectedGame?.defaultTeamSize ?? 5;
    this.form.patchValue({ pickupPlayersPerTeam: perTeam });
  }

  get isGroupStage(): boolean {
    const f = this.form.get('format')?.value;
    return f === 'single_group' || f === 'multi_group';
  }

  get isSingleGroup(): boolean {
    return this.form.get('format')?.value === 'single_group';
  }

  get isMultiGroup(): boolean {
    return this.form.get('format')?.value === 'multi_group';
  }

  get isOneVsOne(): boolean {
    return this.form.get('format')?.value === 'one_vs_one';
  }

  get isPointsRace(): boolean {
    return this.form.get('format')?.value === 'points_race';
  }

  get showMapSeriesOptions(): boolean {
    return showMapSeriesOptions(this.form.get('format')?.value) && (this.selectedGame?.supportsMapVeto ?? true);
  }

  get mapSeriesScopeHint(): string {
    return getMapSeriesScopeHint({
      isOneVsOne: this.isOneVsOne,
      isGroupStage: this.isGroupStage,
    });
  }

  get minTeamsForFormat(): number {
    if (this.isOneVsOne) return 2;
    return this.isSingleGroup ? 3 : this.isMultiGroup ? 4 : MIN_LEAGUE_TEAMS;
  }

  formatAllowed(format: string): boolean {
    if (!this.selectedGame) return true;
    if (format === 'one_vs_one') return this.selectedGame.supportsOneVsOne;
    if (format === 'points_race') return this.selectedGame.allowedLeagueFormats.includes('points_race');
    if (format === 'single_elimination') return this.selectedGame.allowedLeagueFormats.includes('single_elimination');
    if (format === 'single_group' || format === 'multi_group') {
      return this.selectedGame.allowedLeagueFormats.includes('group_stage');
    }
    return true;
  }

  isPickupBalanceModeSelected(mode: PickupBalanceMode): boolean {
    return this.pickupBalanceModes.includes(mode);
  }

  togglePickupBalanceMode(mode: PickupBalanceMode, event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.checked) {
      if (!this.pickupBalanceModes.includes(mode)) {
        this.pickupBalanceModes = [...this.pickupBalanceModes, mode];
      }
      return;
    }
    if (this.pickupBalanceModes.length <= 1) {
      input.checked = true;
      return;
    }
    this.pickupBalanceModes = this.pickupBalanceModes.filter((item) => item !== mode);
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('gc-modal-backdrop')) {
      this.close();
    }
  }

  close(): void {
    if (!this.loading) {
      this.closed.emit();
    }
  }

  private validateMapSettings(): boolean {
    if (!this.showMapSeriesOptions) return true;
    const error = validateLeagueMapSettings(this.mapPool, this.seriesFormat);
    if (error) {
      this.errorMessage = error;
      return false;
    }
    return true;
  }

  onSubmit(): void {
    if (!this.form.valid) {
      this.errorMessage = 'Preencha o nome da liga.';
      return;
    }
    if (!this.validateMapSettings()) {
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    const { game, leagueName, description, maxTeams, registrationOpen, format, groupCount, advancePerGroup, homeAndAway, matchesPerMatchDay, pickupPlayersPerTeam } = this.form.value;
    const capRaw = String(maxTeams ?? '').trim();
    let registrationCap: number | null = null;
    if (capRaw && format !== 'one_vs_one' && format !== 'points_race') {
      registrationCap = Number(capRaw);
      if (!Number.isInteger(registrationCap) || registrationCap < MIN_LEAGUE_TEAMS || registrationCap > MAX_LEAGUE_TEAMS) {
        this.loading = false;
        this.errorMessage = `Limite de vagas deve ser entre ${MIN_LEAGUE_TEAMS} e ${MAX_LEAGUE_TEAMS}, ou deixe em branco.`;
        return;
      }
    }

    if (format === 'one_vs_one') {
      const min = this.selectedGame?.minPickupPlayersPerTeam ?? 1;
      const max = this.selectedGame?.maxPickupPlayersPerTeam ?? 5;
      const perTeam = Number(pickupPlayersPerTeam);
      if (!Number.isInteger(perTeam) || perTeam < min || perTeam > max) {
        this.loading = false;
        this.errorMessage = `Jogadores por time deve ser entre ${min} e ${max}.`;
        return;
      }
    }

    let apiFormat = 'single_elimination';
    let apiGroupCount: number | undefined;
    let apiAdvance: number | undefined;

    if (format === 'single_group') {
      apiFormat = 'group_stage';
      apiGroupCount = 1;
      apiAdvance = Number(advancePerGroup) || 2;
    } else if (format === 'multi_group') {
      apiFormat = 'group_stage';
      apiGroupCount = Number(groupCount) || 2;
      apiAdvance = Number(advancePerGroup) || 2;
    } else if (format === 'one_vs_one') {
      apiFormat = 'ONE_VS_ONE';
      registrationCap = null;
    } else if (format === 'points_race') {
      apiFormat = 'POINTS_RACE';
    }

    let apiHomeAndAway = false;
    let apiMatchesPerDay = 0;

    if (apiFormat === 'group_stage') {
      apiHomeAndAway = !!homeAndAway;
      const perDay = Number(matchesPerMatchDay);
      if (!Number.isInteger(perDay) || perDay < 1 || perDay > 16) {
        this.loading = false;
        this.errorMessage = 'Jogos por dia deve ser entre 1 e 16.';
        return;
      }
      apiMatchesPerDay = perDay;
    }

    const mapSettingsPayload = this.showMapSeriesOptions
      ? buildMapSettingsPayload(this.seriesFormat, this.mapVetoEnabled, this.mapPool)
      : { mapPool: this.mapPool };

    this.leagueService.createLeague({
      game: String(game).toUpperCase(),
      name: leagueName,
      description,
      maxTeams: registrationCap,
      registrationOpen: !!registrationOpen,
      format: apiFormat,
      groupCount: apiGroupCount,
      advancePerGroup: apiAdvance,
      homeAndAway: apiHomeAndAway,
      matchesPerMatchDay: apiMatchesPerDay,
      pickupPlayersPerTeam: format === 'one_vs_one' ? Number(pickupPlayersPerTeam) || 5 : undefined,
      pickupBalanceModes: format === 'one_vs_one' ? this.pickupBalanceModes : undefined,
      ...mapSettingsPayload,
    }).subscribe({
      next: (league) => {
        this.loading = false;
        this.created.emit(league);
      },
      error: (err) => {
        this.loading = false;
        this.errorMessage = err.error?.error || 'Erro ao criar liga.';
      }
    });
  }
}
