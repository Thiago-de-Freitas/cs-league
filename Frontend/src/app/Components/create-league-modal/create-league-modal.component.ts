import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { LeagueService } from '../../Services/league.service';
import { League } from '../../Models/interfaces';
import { ALLOWED_BRACKET_SIZES } from '../../Utils/bracket.util';

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
  bracketSizes = ALLOWED_BRACKET_SIZES;

  constructor(
    private fb: FormBuilder,
    private leagueService: LeagueService
  ) {
    this.form = this.fb.group({
      leagueName: ['', Validators.required],
      description: ['', Validators.maxLength(500)],
      maxTeams: [8, Validators.required],
    });
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
    const { leagueName, description, maxTeams } = this.form.value;

    this.leagueService.createLeague({
      name: leagueName,
      description,
      maxTeams: Number(maxTeams),
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
