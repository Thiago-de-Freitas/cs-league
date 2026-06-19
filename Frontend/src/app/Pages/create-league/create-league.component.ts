import { Component, OnInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { LeagueService } from '../../Services/league.service';
import { League } from '../../Models/interfaces';
import { CreateLeagueModalComponent } from '../../Components/create-league-modal/create-league-modal.component';

@Component({
  selector: 'app-create-league',
  standalone: true,
  imports: [CommonModule, RouterModule, CreateLeagueModalComponent],
  templateUrl: './create-league.component.html',
  styleUrls: ['./create-league.component.css']
})
export class CreateLeagueComponent implements OnInit {
  leagues: League[] = [];
  loading = true;
  showCreateModal = false;
  successMessage = '';
  createdLeagueId: string | null = null;

  constructor(
    private router: Router,
    private leagueService: LeagueService
  ) {}

  ngOnInit(): void {
    this.loadLeagues();
  }

  loadLeagues(): void {
    this.loading = true;
    this.leagueService.getLeagues().subscribe({
      next: (leagues) => {
        this.leagues = leagues;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  openCreateModal(): void {
    this.showCreateModal = true;
    this.successMessage = '';
    this.createdLeagueId = null;
  }

  closeCreateModal(): void {
    this.showCreateModal = false;
  }

  onLeagueCreated(league: League): void {
    this.showCreateModal = false;
    this.createdLeagueId = league.id;
    this.successMessage = `Liga "${league.name}" criada com sucesso!`;
    this.loadLeagues();
  }

  goToLeagueDetails(): void {
    if (this.createdLeagueId) {
      this.router.navigate(['/league-details', this.createdLeagueId]);
    }
  }

  goToLeagueDetailsById(id: string): void {
    this.router.navigate(['/league-details', id]);
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      upcoming: 'Em breve',
      ongoing: 'Em andamento',
      completed: 'Finalizada',
    };
    return labels[status] || status;
  }
}
