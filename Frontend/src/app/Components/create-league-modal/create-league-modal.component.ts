import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { LeagueService } from '../../Services/league.service';
import { League } from '../../Models/interfaces';
import { MAX_LEAGUE_TEAMS, MIN_LEAGUE_TEAMS } from '../../Utils/bracket.util';

@Component({
  selector: 'app-create-league-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
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
      maxTeams: [''],
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

  get minTeamsForFormat(): number {
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

  onSubmit(): void {
    if (!this.form.valid) {
      this.errorMessage = 'Preencha o nome da liga.';
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    const { leagueName, description, maxTeams, registrationOpen, format, groupCount, advancePerGroup } = this.form.value;
    const capRaw = String(maxTeams ?? '').trim();
    let registrationCap: number | null = null;
    if (capRaw) {
      registrationCap = Number(capRaw);
      if (!Number.isInteger(registrationCap) || registrationCap < MIN_LEAGUE_TEAMS || registrationCap > MAX_LEAGUE_TEAMS) {
        this.loading = false;
        this.errorMessage = `Limite de vagas deve ser entre ${MIN_LEAGUE_TEAMS} e ${MAX_LEAGUE_TEAMS}, ou deixe em branco.`;
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
    }

    this.leagueService.createLeague({
      name: leagueName,
      description,
      maxTeams: registrationCap,
      registrationOpen: !!registrationOpen,
      format: apiFormat,
      groupCount: apiGroupCount,
      advancePerGroup: apiAdvance,
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
