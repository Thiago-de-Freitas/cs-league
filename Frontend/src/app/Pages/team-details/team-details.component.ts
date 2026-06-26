import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { TeamService } from '../../Services/team.service';
import { AuthService } from '../../Services/auth.service';
import { Team, TeamInvite, User } from '../../Models/interfaces';
import { ConfirmModalComponent } from '../../Components/confirm-modal/confirm-modal.component';
import { UserSearchPickerComponent } from '../../Components/user-search-picker/user-search-picker.component';
import { NotificationService } from '../../Services/notification.service';
import { getPlayerPositionLabel } from '../../Utils/player-positions';
import { resolveUploadAssetUrl } from '../../Utils/upload-asset.util';

@Component({
  selector: 'app-team-details',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, ConfirmModalComponent, UserSearchPickerComponent],
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
  isSystemAdmin = false;
  rosterBusyUserId: string | null = null;
  inviteMsg = '';
  inviteError = '';
  deletingTeam = false;
  showDeleteConfirm = false;
  uploadingLogo = false;
  teamLogoBroken = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private teamService: TeamService,
    public authService: AuthService,
    private notify: NotificationService
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
        this.isSystemAdmin = this.authService.isSystemAdmin();
        this.teamLogoBroken = false;
        this.loading = false;
      },
      error: (err) => {
        if (err.status === 403) {
          this.errorMsg = 'Você não tem permissão para acessar este time.';
        } else {
          this.errorMsg = 'Time não encontrado.';
        }
        this.loading = false;
      }
    });
  }

  get rosterUserIds(): string[] {
    return this.team?.players.map((p) => p.id) ?? [];
  }

  get canManageRoster(): boolean {
    return this.isOwner;
  }

  formatMemberRole(role: string): string {
    return role === 'CAPTAIN' ? 'Capitão' : 'Membro';
  }

  formatPosition(position: string | null | undefined): string {
    return getPlayerPositionLabel(position);
  }

  get teamLogoSrc(): string | null {
    if (!this.team?.logoUrl || this.teamLogoBroken) return null;
    return resolveUploadAssetUrl(this.team.logoUrl);
  }

  onTeamLogoError(): void {
    this.teamLogoBroken = true;
  }

  isTeamCaptain(memberId: string): boolean {
    return this.team?.players.some((p) => p.id === memberId && p.role === 'CAPTAIN') ?? false;
  }

  addUserToTeam(user: User): void {
    if (!this.teamId) return;
    this.inviteError = '';
    this.inviteMsg = '';
    this.rosterBusyUserId = user.id;
    this.teamService.addMember(this.teamId, user.id).subscribe({
      next: (team) => {
        this.team = team;
        this.rosterBusyUserId = null;
        this.inviteMsg = `${user.displayName} adicionado ao time`;
      },
      error: (err) => {
        this.rosterBusyUserId = null;
        this.inviteError = err.error?.error || 'Erro ao adicionar jogador';
      },
    });
  }

  setTeamCaptain(userId: string): void {
    if (!this.teamId || !this.canManageRoster) return;
    this.rosterBusyUserId = userId;
    this.teamService.updateMemberRole(this.teamId, userId, 'CAPTAIN').subscribe({
      next: (team) => {
        this.team = team;
        this.rosterBusyUserId = null;
        this.notify.success('Capitão atualizado.', 'Roster');
      },
      error: (err) => {
        this.rosterBusyUserId = null;
        this.notify.error(err.error?.error || 'Erro ao definir capitão.');
      },
    });
  }

  removeTeamCaptain(userId: string): void {
    if (!this.teamId || !this.canManageRoster) return;
    this.rosterBusyUserId = userId;
    this.teamService.updateMemberRole(this.teamId, userId, 'MEMBER').subscribe({
      next: (team) => {
        this.team = team;
        this.rosterBusyUserId = null;
        this.notify.success('Capitania removida.', 'Roster');
      },
      error: (err) => {
        this.rosterBusyUserId = null;
        this.notify.error(err.error?.error || 'Erro ao remover capitania.');
      },
    });
  }

  removeMember(userId: string, displayName: string): void {
    if (!this.teamId || !this.canManageRoster) return;
    this.rosterBusyUserId = userId;
    this.teamService.removeMember(this.teamId, userId).subscribe({
      next: (team) => {
        this.team = team;
        this.rosterBusyUserId = null;
        this.notify.success(`${displayName} removido do time.`, 'Roster');
      },
      error: (err) => {
        this.rosterBusyUserId = null;
        this.notify.error(err.error?.error || 'Erro ao remover jogador.');
      },
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
    this.showDeleteConfirm = true;
  }

  confirmDeleteTeam(): void {
    if (!this.teamId) return;
    this.deletingTeam = true;
    this.teamService.deleteTeam(this.teamId).subscribe({
      next: () => this.router.navigate(['/create-team']),
      error: (err) => {
        this.deletingTeam = false;
        this.showDeleteConfirm = false;
        this.notify.error(err.error?.error || 'Erro ao excluir time');
      }
    });
  }

  cancelDeleteTeam(): void {
    if (!this.deletingTeam) {
      this.showDeleteConfirm = false;
    }
  }

  onLogoSelected(event: Event): void {
    if (!this.teamId) return;
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      this.notify.warning('A imagem deve ter no máximo 2 MB.', 'Arquivo grande');
      input.value = '';
      return;
    }

    this.uploadingLogo = true;
    this.teamService.uploadLogo(this.teamId, file).subscribe({
      next: (team) => {
        this.team = team;
        this.teamLogoBroken = false;
        this.uploadingLogo = false;
        input.value = '';
        this.notify.success('Logo atualizada com sucesso.', 'Logo do time');
      },
      error: (err) => {
        this.uploadingLogo = false;
        input.value = '';
        this.notify.error(err.error?.error || 'Erro ao enviar logo.');
      }
    });
  }

  removeLogo(): void {
    if (!this.teamId || !this.team?.logoUrl) return;
    this.uploadingLogo = true;
    this.teamService.removeLogo(this.teamId).subscribe({
      next: (team) => {
        this.team = team;
        this.teamLogoBroken = false;
        this.uploadingLogo = false;
        this.notify.success('Logo removida.', 'Logo do time');
      },
      error: (err) => {
        this.uploadingLogo = false;
        this.notify.error(err.error?.error || 'Erro ao remover logo.');
      }
    });
  }
}
