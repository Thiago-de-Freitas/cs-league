import { Component, OnInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { LeagueService } from '../../Services/league.service';
import { League, Player, Team } from '../../Models/interfaces';
import { CreateLeagueModalComponent } from '../../Components/create-league-modal/create-league-modal.component';
import { resolveUploadAssetUrl } from '../../Utils/upload-asset.util';
import { getPlayerPositionLabel } from '../../Utils/player-positions';

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
  brokenLogoIds = new Set<string>();

  constructor(
    private router: Router,
    private leagueService: LeagueService
  ) {}

  ngOnInit(): void {
    this.loadLeagues();
  }

  loadLeagues(): void {
    this.loading = true;
    this.leagueService.getLeagues(true).subscribe({
      next: (leagues) => {
        this.leagues = leagues.map((league) => ({
          ...league,
          teams: (league.teams || []).map((team) => ({
            ...team,
            players: this.sortPlayers(team.players || []),
          })),
        }));
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

  goToTeamDetails(teamId: string): void {
    this.router.navigate(['/team-details', teamId]);
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

  getTeamCountLabel(league: League): string {
    const count = league.teamCount ?? league.teams?.length ?? 0;
    if (league.maxTeams != null) return `${count}/${league.maxTeams} times`;
    return `${count} time(s)`;
  }

  getTeamLogoUrl(team: Team): string | null {
    if (!team.logoUrl || this.brokenLogoIds.has(team.id)) return null;
    return resolveUploadAssetUrl(team.logoUrl);
  }

  onTeamLogoError(teamId: string): void {
    this.brokenLogoIds.add(teamId);
  }

  formatPosition(position: string | null | undefined): string {
    return getPlayerPositionLabel(position) || '';
  }

  formatAdr(player: Player): string {
    if (player.adr == null) return '—';
    return player.adr.toFixed(1);
  }

  formatTeamAdr(team: Team): string {
    if (team.teamAdr == null) return '—';
    return team.teamAdr.toFixed(1);
  }

  hasAdr(player: Player): boolean {
    return player.adr != null && (player.matches ?? 0) > 0;
  }

  hasTeamAdr(team: Team): boolean {
    return team.teamAdr != null;
  }

  formatRoundDiff(team: Team): string {
    const diff = team.roundDifference ?? team.roundsWon - team.roundsLost;
    if (diff > 0) return `+${diff}`;
    return String(diff);
  }

  private sortPlayers(players: Player[]): Player[] {
    return [...players].sort((a, b) => {
      const captainDiff = Number(b.role === 'CAPTAIN') - Number(a.role === 'CAPTAIN');
      if (captainDiff !== 0) return captainDiff;
      return a.name.localeCompare(b.name, 'pt-BR');
    });
  }
}
