import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { LeagueService } from '../../Services/league.service';
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
import { DEFAULT_MAP_POOL } from '../../Utils/maps';

@Component({
  selector: 'app-create-league-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, LeagueSeriesMapSettingsComponent],
  templateUrl: './create-league-modal.component.html',
  styleUrls: ['./create-league-modal.component.css']
})
export class CreateLeagueModalComponent {
  @Output() closed = new EventEmitter<void>();
  @Output() created = new EventEmitter<League>();

  form: FormGroup;
  loading = false;
  errorMessage = '';
  minTeams = MIN_LEAGUE_TEAMS;
  maxTeamsLimit = MAX_LEAGUE_TEAMS;
  mapPool: string[] = [...DEFAULT_MAP_POOL];
  seriesFormat: LeagueSeriesFormat = 'bo1';
  mapVetoEnabled = true;

  constructor(
    private fb: FormBuilder,
    private leagueService: LeagueService
  ) {
    this.form = this.fb.group({
      leagueName: ['', Validators.required],
      description: ['', Validators.maxLength(500)],
      format: ['single_elimination'],
      groupCount: [2],
      advancePerGroup: [2],
      homeAndAway: [false],
      matchesPerMatchDay: [2],
      maxTeams: [''],
      pickupTeamCount: [2],
      pickupPlayersPerTeam: [5],
      pickupBalanceMode: ['rating'],
      registrationOpen: [false],
    });
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

  get showMapSeriesOptions(): boolean {
    return showMapSeriesOptions(this.form.get('format')?.value);
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
    const { leagueName, description, maxTeams, registrationOpen, format, groupCount, advancePerGroup, homeAndAway, matchesPerMatchDay, pickupTeamCount, pickupPlayersPerTeam, pickupBalanceMode } = this.form.value;
    const capRaw = String(maxTeams ?? '').trim();
    let registrationCap: number | null = null;
    if (capRaw && format !== 'one_vs_one') {
      registrationCap = Number(capRaw);
      if (!Number.isInteger(registrationCap) || registrationCap < MIN_LEAGUE_TEAMS || registrationCap > MAX_LEAGUE_TEAMS) {
        this.loading = false;
        this.errorMessage = `Limite de vagas deve ser entre ${MIN_LEAGUE_TEAMS} e ${MAX_LEAGUE_TEAMS}, ou deixe em branco.`;
        return;
      }
    }

    if (format === 'one_vs_one') {
      const teams = Number(pickupTeamCount);
      const perTeam = Number(pickupPlayersPerTeam);
      if (!Number.isInteger(teams) || teams < 2 || teams > 16) {
        this.loading = false;
        this.errorMessage = 'Número de times deve ser entre 2 e 16.';
        return;
      }
      if (!Number.isInteger(perTeam) || perTeam < 1 || perTeam > 5) {
        this.loading = false;
        this.errorMessage = 'Jogadores por time deve ser entre 1 e 5.';
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
      : {};

    this.leagueService.createLeague({
      name: leagueName,
      description,
      maxTeams: registrationCap,
      registrationOpen: !!registrationOpen,
      format: apiFormat,
      groupCount: apiGroupCount,
      advancePerGroup: apiAdvance,
      homeAndAway: apiHomeAndAway,
      matchesPerMatchDay: apiMatchesPerDay,
      pickupTeamCount: format === 'one_vs_one' ? Number(pickupTeamCount) || 2 : undefined,
      pickupPlayersPerTeam: format === 'one_vs_one' ? Number(pickupPlayersPerTeam) || 5 : undefined,
      pickupBalanceMode: format === 'one_vs_one' ? pickupBalanceMode : undefined,
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
