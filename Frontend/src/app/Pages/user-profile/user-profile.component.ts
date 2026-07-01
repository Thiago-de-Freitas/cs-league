import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { UsersService } from '../../Services/users.service';
import { PersonalStatsOverview, PublicUserProfile } from '../../Models/interfaces';
import { ProfileAnalyticsSectionComponent } from '../../Components/profile-analytics/profile-analytics.component';
import { resolveUploadAssetUrl } from '../../Utils/upload-asset.util';

@Component({
  selector: 'app-user-profile',
  standalone: true,
  imports: [CommonModule, RouterModule, ProfileAnalyticsSectionComponent],
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

  get personalStats(): PersonalStatsOverview | null {
    return this.profile?.personalStats ?? null;
  }

  get personalSummary() {
    return this.personalStats?.summary;
  }

  get personalDemoStats() {
    return this.personalStats?.demos ?? [];
  }

  get recentPersonalDemos() {
    return this.personalDemoStats.slice(0, 20);
  }

  get hasPersonalStats(): boolean {
    return (this.personalSummary?.demosCompleted ?? 0) > 0;
  }

  get performanceAnalytics() {
    return this.personalStats?.analytics ?? null;
  }

  gaugePercent(value: number, max: number): number {
    return Math.min(100, Math.round((value / max) * 100));
  }

  kdGaugePercent(): number {
    return this.gaugePercent(this.personalSummary?.kd || 0, 2);
  }

  ratingGaugePercent(): number {
    return this.gaugePercent(this.personalSummary?.rating || 0, 2);
  }

  kastGaugePercent(): number {
    return this.gaugePercent(this.personalSummary?.kast || 0, 100);
  }

  hsGaugePercent(): number {
    return this.gaugePercent(this.personalSummary?.hsPercent || 0, 100);
  }

  adrGaugePercent(): number {
    return this.gaugePercent(this.personalSummary?.adr || 0, 120);
  }

  kdaGaugePercent(): number {
    return this.gaugePercent(this.personalSummary?.kda || 0, 3);
  }

  impactGaugePercent(): number {
    const diff = this.personalSummary?.kdDiff || 0;
    return this.gaugePercent(Math.abs(diff), 30);
  }

  formatKdDiff(value: number): string {
    if (value > 0) return `+${value}`;
    return String(value);
  }

  formatDamage(value: number): string {
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}k`;
    }
    return String(value);
  }

  shortFileName(fileName: string): string {
    if (fileName.length <= 28) return fileName;
    return `${fileName.slice(0, 12)}…${fileName.slice(-12)}`;
  }

  demoGridClass(status: string): string {
    if (status === 'completed') return 'match-dot-win';
    if (status === 'failed') return 'match-dot-loss';
    return 'match-dot-pending';
  }

  goToEditProfile(): void {
    this.router.navigate(['/profile']);
  }
}
