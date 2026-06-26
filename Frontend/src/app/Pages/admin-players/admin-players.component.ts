import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import {
  ADMIN_USER_PAGE_SIZE_OPTIONS,
  AdminUserPageSize,
  UsersService,
} from '../../Services/users.service';
import { AuthService } from '../../Services/auth.service';
import { AdminUserEntry } from '../../Models/interfaces';
import { PLAYER_POSITIONS, getPlayerPositionLabel } from '../../Utils/player-positions';
import { resolveUploadAssetUrl } from '../../Utils/upload-asset.util';
import { ConfirmModalComponent } from '../../Components/confirm-modal/confirm-modal.component';

type ModerationAction = 'deactivate' | 'activate' | 'ban' | 'unban' | 'delete';

@Component({
  selector: 'app-admin-players',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, ConfirmModalComponent],
  templateUrl: './admin-players.component.html',
  styleUrls: ['./admin-players.component.css'],
})
export class AdminPlayersComponent implements OnInit {
  users: AdminUserEntry[] = [];
  loading = true;
  searchQuery = '';
  positionFilter = '';
  roleFilter = '';
  statusFilter = '';

  page = 1;
  pageSize: AdminUserPageSize = 10;
  total = 0;
  totalPages = 1;

  moderationTarget: AdminUserEntry | null = null;
  moderationAction: ModerationAction | null = null;
  banDays = 7;
  moderationLoading = false;
  moderationError = '';

  readonly pageSizeOptions = ADMIN_USER_PAGE_SIZE_OPTIONS;
  readonly positionOptions = PLAYER_POSITIONS;
  readonly roleOptions = [
    { value: '', label: 'Todos' },
    { value: 'USER', label: 'Usuário' },
    { value: 'ADMIN', label: 'Administrador' },
  ];
  readonly statusOptions = [
    { value: '', label: 'Todos' },
    { value: 'active', label: 'Ativos' },
    { value: 'banned', label: 'Banidos' },
    { value: 'inactive', label: 'Desativados' },
  ];

  private brokenAvatarIds = new Set<string>();

  constructor(
    private usersService: UsersService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    if (!this.authService.isSystemAdmin()) {
      this.router.navigate(['/dashboard']);
      return;
    }
    this.loadUsers();
  }

  get rangeLabel(): string {
    if (this.total === 0) return 'Nenhum jogador';
    const start = (this.page - 1) * this.pageSize + 1;
    const end = Math.min(this.page * this.pageSize, this.total);
    return `${start}–${end} de ${this.total}`;
  }

  loadUsers(): void {
    this.loading = true;
    this.usersService
      .listUsers({
        page: this.page,
        pageSize: this.pageSize,
        q: this.searchQuery,
        position: this.positionFilter || undefined,
        role: this.roleFilter || undefined,
        status: this.statusFilter || undefined,
      })
      .subscribe({
        next: (result) => {
          this.users = result.users;
          this.page = result.page ?? this.page;
          this.pageSize = (result.pageSize ?? this.pageSize) as AdminUserPageSize;
          this.total = result.total ?? 0;
          this.totalPages = result.totalPages ?? 1;
          this.loading = false;
        },
        error: () => {
          this.loading = false;
        },
      });
  }

  applyFilters(): void {
    this.page = 1;
    this.loadUsers();
  }

  onPageSizeChange(): void {
    this.page = 1;
    this.loadUsers();
  }

  goToPage(nextPage: number): void {
    if (nextPage < 1 || nextPage > this.totalPages || nextPage === this.page || this.loading) {
      return;
    }
    this.page = nextPage;
    this.loadUsers();
  }

  avatarSrc(user: AdminUserEntry): string | null {
    if (!user.avatarUrl || this.brokenAvatarIds.has(user.id)) return null;
    return resolveUploadAssetUrl(user.avatarUrl);
  }

  onAvatarError(userId: string): void {
    this.brokenAvatarIds.add(userId);
  }

  getPositionLabel(user: AdminUserEntry): string {
    return user.positionLabel || getPlayerPositionLabel(user.position);
  }

  formatPosition(position: string): string {
    return getPlayerPositionLabel(position);
  }

  getRoleLabel(role: string): string {
    return role === 'ADMIN' ? 'Admin' : 'Usuário';
  }

  formatDate(value: string): string {
    return new Date(value).toLocaleDateString('pt-BR');
  }

  formatBannedUntil(value: string | null): string {
    if (!value) return '';
    return new Date(value).toLocaleString('pt-BR');
  }

  getProfileLink(user: AdminUserEntry): string[] {
    return ['/users', user.id];
  }

  canModerate(user: AdminUserEntry): boolean {
    const current = this.authService.currentUser;
    if (!current) return false;
    if (user.id === current.id) return false;
    if (user.role === 'ADMIN') return false;
    return true;
  }

  openModeration(user: AdminUserEntry, action: ModerationAction): void {
    this.moderationTarget = user;
    this.moderationAction = action;
    this.moderationError = '';
    if (action === 'ban') {
      this.banDays = 7;
    }
  }

  closeModeration(): void {
    if (this.moderationLoading) return;
    this.moderationTarget = null;
    this.moderationAction = null;
    this.moderationError = '';
  }

  confirmModeration(): void {
    if (!this.moderationTarget || !this.moderationAction) return;

    this.moderationLoading = true;
    this.moderationError = '';

    const userId = this.moderationTarget.id;
    const onSuccess = (result: { user?: AdminUserEntry; success?: boolean }) => {
      if (result.user) {
        this.users = this.users.map((row) => (row.id === result.user!.id ? result.user! : row));
      } else {
        this.users = this.users.filter((row) => row.id !== userId);
        this.total = Math.max(0, this.total - 1);
      }
      this.moderationLoading = false;
      this.closeModeration();
      if (this.users.length === 0 && this.page > 1) {
        this.page -= 1;
        this.loadUsers();
      }
    };
    const onError = (err: { error?: { error?: string } }) => {
      this.moderationLoading = false;
      this.moderationError = err?.error?.error ?? 'Não foi possível concluir a ação.';
    };

    switch (this.moderationAction) {
      case 'deactivate':
        this.usersService.deactivateUser(userId).subscribe({ next: onSuccess, error: onError });
        break;
      case 'activate':
        this.usersService.activateUser(userId).subscribe({ next: onSuccess, error: onError });
        break;
      case 'ban':
        if (!Number.isInteger(this.banDays) || this.banDays < 1 || this.banDays > 365) {
          this.moderationError = 'Informe entre 1 e 365 dias.';
          this.moderationLoading = false;
          return;
        }
        this.usersService.banUser(userId, this.banDays).subscribe({ next: onSuccess, error: onError });
        break;
      case 'unban':
        this.usersService.unbanUser(userId).subscribe({ next: onSuccess, error: onError });
        break;
      case 'delete':
        this.usersService.deleteUser(userId).subscribe({ next: onSuccess, error: onError });
        break;
    }
  }

  get moderationTitle(): string {
    switch (this.moderationAction) {
      case 'deactivate':
        return 'Desativar jogador';
      case 'activate':
        return 'Reativar jogador';
      case 'ban':
        return 'Banir jogador';
      case 'unban':
        return 'Remover banimento';
      case 'delete':
        return 'Excluir jogador';
      default:
        return 'Confirmar ação';
    }
  }

  get moderationMessage(): string {
    switch (this.moderationAction) {
      case 'deactivate':
        return 'O jogador não poderá mais fazer login até ser reativado.';
      case 'activate':
        return 'O jogador voltará a poder acessar o sistema.';
      case 'ban':
        return 'O jogador poderá logar, mas ficará impedido de criar partidas, enviar demos e participar de ligas e jogos.';
      case 'unban':
        return 'O jogador voltará a participar normalmente do sistema.';
      case 'delete':
        return 'Esta ação é permanente. Todos os dados do jogador serão removidos, incluindo times e ligas que ele possui.';
      default:
        return '';
    }
  }
}
