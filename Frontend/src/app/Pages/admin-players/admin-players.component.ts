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

@Component({
  selector: 'app-admin-players',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './admin-players.component.html',
  styleUrls: ['./admin-players.component.css'],
})
export class AdminPlayersComponent implements OnInit {
  users: AdminUserEntry[] = [];
  loading = true;
  searchQuery = '';
  positionFilter = '';
  roleFilter = '';

  page = 1;
  pageSize: AdminUserPageSize = 10;
  total = 0;
  totalPages = 1;

  readonly pageSizeOptions = ADMIN_USER_PAGE_SIZE_OPTIONS;
  readonly positionOptions = PLAYER_POSITIONS;
  readonly roleOptions = [
    { value: '', label: 'Todos' },
    { value: 'USER', label: 'Usuário' },
    { value: 'ADMIN', label: 'Administrador' },
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

  getProfileLink(user: AdminUserEntry): string[] | null {
    if (!user.steamId?.trim()) return null;
    return ['/player', user.steamId];
  }
}
