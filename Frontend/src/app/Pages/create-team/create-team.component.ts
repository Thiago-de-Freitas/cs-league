import { Component, OnInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TeamService } from '../../Services/team.service';
import { Player, Team } from '../../Models/interfaces';
import { CreateTeamModalComponent, TeamCreatedEvent } from '../../Components/create-team-modal/create-team-modal.component';
import { resolveUploadAssetUrl } from '../../Utils/upload-asset.util';
import { getPlayerPositionLabel } from '../../Utils/player-positions';

@Component({
  selector: 'app-create-team',
  standalone: true,
  imports: [CommonModule, RouterModule, CreateTeamModalComponent],
  templateUrl: './create-team.component.html',
  styleUrls: ['./create-team.component.css']
})
export class CreateTeamComponent implements OnInit {
  teams: Team[] = [];
  loading = true;
  showCreateModal = false;
  successMessage = '';
  createdTeamId: string | null = null;
  brokenLogoIds = new Set<string>();

  constructor(
    private router: Router,
    private teamService: TeamService
  ) {}

  ngOnInit(): void {
    this.loadTeams();
  }

  loadTeams(): void {
    this.loading = true;
    this.teamService.getTeams().subscribe({
      next: (teams) => {
        this.teams = teams.map((team) => ({
          ...team,
          players: this.sortPlayers(team.players || []),
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
    this.createdTeamId = null;
  }

  closeCreateModal(): void {
    this.showCreateModal = false;
  }

  onTeamCreated(event: TeamCreatedEvent): void {
    this.showCreateModal = false;
    this.createdTeamId = event.team.id;
    this.successMessage = event.message;
    this.loadTeams();
  }

  goToTeamDetails(): void {
    if (this.createdTeamId) {
      this.router.navigate(['/team-details', this.createdTeamId]);
    }
  }

  goToTeamDetailsById(id: string): void {
    this.router.navigate(['/team-details', id]);
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

  formatMemberRole(role: string): string {
    return role === 'CAPTAIN' ? 'Capitão' : 'Membro';
  }

  formatAdr(player: Player): string {
    if (player.adr == null) return '—';
    return player.adr.toFixed(1);
  }

  hasAdr(player: Player): boolean {
    return player.adr != null && (player.matches ?? 0) > 0;
  }

  private sortPlayers(players: Player[]): Player[] {
    return [...players].sort((a, b) => {
      const captainDiff = Number(b.role === 'CAPTAIN') - Number(a.role === 'CAPTAIN');
      if (captainDiff !== 0) return captainDiff;
      return a.name.localeCompare(b.name, 'pt-BR');
    });
  }
}
