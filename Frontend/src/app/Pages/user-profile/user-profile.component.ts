import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { UsersService } from '../../Services/users.service';
import { PublicUserProfile } from '../../Models/interfaces';
import { resolveUploadAssetUrl } from '../../Utils/upload-asset.util';

@Component({
  selector: 'app-user-profile',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './user-profile.component.html',
  styleUrls: ['../profile/profile.component.css', './user-profile.component.css'],
})
export class UserProfileComponent implements OnInit {
  profile: PublicUserProfile | null = null;
  loading = true;
  errorMsg = '';
  private brokenAvatar = false;
  private brokenTeamLogos = new Set<string>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private usersService: UsersService
  ) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const userId = params.get('id');
      if (!userId) {
        this.errorMsg = 'Jogador não informado.';
        this.loading = false;
        return;
      }
      this.loadProfile(userId);
    });
  }

  loadProfile(userId: string): void {
    this.loading = true;
    this.errorMsg = '';
    this.brokenAvatar = false;
    this.usersService.getUserProfile(userId).subscribe({
      next: (profile) => {
        this.profile = profile;
        this.loading = false;
      },
      error: (err) => {
        this.errorMsg = err.error?.error || 'Jogador não encontrado.';
        this.loading = false;
      },
    });
  }

  get avatarSrc(): string | null {
    if (!this.profile?.avatarUrl || this.brokenAvatar) return null;
    return resolveUploadAssetUrl(this.profile.avatarUrl);
  }

  onAvatarError(): void {
    this.brokenAvatar = true;
  }

  teamLogoSrc(teamId: string, logoUrl: string | null): string | null {
    if (!logoUrl || this.brokenTeamLogos.has(teamId)) return null;
    return resolveUploadAssetUrl(logoUrl);
  }

  onTeamLogoError(teamId: string): void {
    this.brokenTeamLogos.add(teamId);
  }

  formatDate(value: string): string {
    return new Date(value).toLocaleDateString('pt-BR');
  }

  getRoleLabel(role: string): string {
    if (role === 'CAPTAIN') return 'Capitão';
    if (role === 'MEMBER') return 'Membro';
    return role;
  }

  get hasLeagueStats(): boolean {
    return !!this.profile?.leagueStats;
  }

  goToEditProfile(): void {
    this.router.navigate(['/profile']);
  }
}
