import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { TeamService } from '../../Services/team.service';
import { AuthService } from '../../Services/auth.service';
import { Team, TeamInvite, User } from '../../Models/interfaces';

@Component({
  selector: 'app-team-details',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './team-details.component.html',
  styleUrls: ['./team-details.component.css']
})
export class TeamDetailsComponent implements OnInit {
  teamId: string | null = null;
  team: Team | null = null;
  pendingInvites: TeamInvite[] = [];
  loading = true;
  errorMsg = '';
  isOwner = false;
  searchQuery = '';
  searchResults: User[] = [];
  inviteMsg = '';
  inviteError = '';
  deletingTeam = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private teamService: TeamService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.teamId = this.route.snapshot.paramMap.get('id');
    if (this.teamId) {
      this.loadTeam(this.teamId);
    }
    this.teamService.getPendingInvites().subscribe({
      next: (invites) => (this.pendingInvites = invites)
    });
  }

  loadTeam(id: string): void {
    this.loading = true;
    this.teamService.getTeamById(id).subscribe({
      next: (team) => {
        this.team = team;
        this.isOwner = this.authService.isTeamOwner(team.ownerId || '');
        this.loading = false;
      },
      error: () => {
        this.errorMsg = 'Time não encontrado.';
        this.loading = false;
      }
    });
  }

  onSearchUsers(): void {
    if (this.searchQuery.length < 2) {
      this.searchResults = [];
      return;
    }
    this.teamService.searchUsers(this.searchQuery).subscribe({
      next: (users) => {
        const memberIds = new Set(this.team?.players.map((p) => p.id) || []);
        this.searchResults = users.filter((u) => !memberIds.has(u.id));
      }
    });
  }

  inviteUser(user: User): void {
    if (!this.teamId) return;
    this.inviteError = '';
    this.teamService.inviteUser(this.teamId, user.id).subscribe({
      next: () => {
        this.inviteMsg = `Convite enviado para ${user.displayName}`;
        this.searchResults = this.searchResults.filter((u) => u.id !== user.id);
        this.searchQuery = '';
      },
      error: (err) => {
        this.inviteError = err.error?.error || 'Erro ao enviar convite';
      }
    });
  }

  acceptInvite(invite: TeamInvite): void {
    if (!invite.team) return;
    this.teamService.acceptInvite(invite.team.id, invite.id).subscribe({
      next: () => {
        this.pendingInvites = this.pendingInvites.filter((i) => i.id !== invite.id);
        if (this.teamId) this.loadTeam(this.teamId);
      }
    });
  }

  rejectInvite(invite: TeamInvite): void {
    if (!invite.team) return;
    this.teamService.rejectInvite(invite.team.id, invite.id).subscribe({
      next: () => {
        this.pendingInvites = this.pendingInvites.filter((i) => i.id !== invite.id);
      }
    });
  }

  deleteTeam(): void {
    if (!this.teamId || !confirm('Excluir este time permanentemente? Esta ação não pode ser desfeita.')) return;
    this.deletingTeam = true;
    this.teamService.deleteTeam(this.teamId).subscribe({
      next: () => this.router.navigate(['/create-team']),
      error: (err) => {
        this.deletingTeam = false;
        alert(err.error?.error || 'Erro ao excluir time');
      }
    });
  }
}
