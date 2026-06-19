import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { LeagueService } from '../../Services/league.service';
import { League } from '../../Models/interfaces';
import { ALLOWED_BRACKET_SIZES } from '../../Utils/bracket.util';

@Component({
  selector: 'app-create-league',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './create-league.component.html',
  styleUrls: ['./create-league.component.css']
})
export class CreateLeagueComponent implements OnInit {
  createLeagueForm: FormGroup;
  createdLeagueId: string | null = null;
  createdLeagueName = '';
  successMessage = '';
  errorMessage = '';
  leagues: League[] = [];
  loading = false;
  bracketSizes = ALLOWED_BRACKET_SIZES;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private leagueService: LeagueService
  ) {
    this.createLeagueForm = this.fb.group({
      leagueName: ['', Validators.required],
      description: ['', Validators.maxLength(500)],
      maxTeams: [8, Validators.required],
      isPublic: [true]
    });
  }

  ngOnInit(): void {
    this.loadLeagues();
  }

  loadLeagues(): void {
    this.leagueService.getLeagues().subscribe({
      next: (leagues) => (this.leagues = leagues),
      error: () => {}
    });
  }

  onSubmit(): void {
    if (!this.createLeagueForm.valid) {
      this.errorMessage = 'Preencha o nome da liga.';
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    const { leagueName, description, maxTeams } = this.createLeagueForm.value;

    this.leagueService.createLeague({
      name: leagueName,
      description,
      maxTeams: Number(maxTeams),
    }).subscribe({
      next: (league) => {
        this.loading = false;
        this.createdLeagueId = league.id;
        this.createdLeagueName = league.name;
        this.successMessage = `Liga "${league.name}" criada com sucesso!`;
        this.createLeagueForm.reset({ isPublic: true, maxTeams: 8 });
        this.loadLeagues();
      },
      error: (err) => {
        this.loading = false;
        this.errorMessage = err.error?.error || 'Erro ao criar liga.';
      }
    });
  }

  goToLeagueDetails(): void {
    if (this.createdLeagueId) {
      this.router.navigate(['/league-details', this.createdLeagueId]);
    }
  }

  goToLeagueDetailsById(id: string): void {
    this.router.navigate(['/league-details', id]);
  }
}
