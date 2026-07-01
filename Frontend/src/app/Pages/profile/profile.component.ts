import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { Subscription, interval } from 'rxjs';
import { startWith, switchMap, takeWhile } from 'rxjs/operators';
import { AuthService } from '../../Services/auth.service';
import { DemoService } from '../../Services/demo.service';
import { NotificationService } from '../../Services/notification.service';
import { Demo, PersonalDemoStat, PersonalHighlightEntry, PersonalStatsOverview } from '../../Models/interfaces';
import { hasHighlightVideoRendering } from '../../Utils/highlight-generate-pending.util';
import { HIGHLIGHTS_FEATURE_ENABLED } from '../../Utils/feature-flags';
import {
  getHighlightTypeAccent,
  getHighlightRenderBadgeClass,
  getHighlightRenderLabel,
  getHighlightTypeLabel,
} from '../../Utils/highlight-display.util';
import { DemoUploadModalComponent } from '../../Components/demo-upload-modal/demo-upload-modal.component';
import { DemoStatusLoaderComponent } from '../../Components/demo-status-loader/demo-status-loader.component';
import { ProfileAnalyticsSectionComponent } from '../../Components/profile-analytics/profile-analytics.component';
import { resolveUploadAssetUrl } from '../../Utils/upload-asset.util';
import { PLAYER_POSITIONS, getPlayerPositionLabel, normalizePlayerPositionForForm } from '../../Utils/player-positions';

type ProfileTab = 'stats' | 'demos' | 'highlights' | 'settings';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, DemoUploadModalComponent, DemoStatusLoaderComponent, ProfileAnalyticsSectionComponent],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css']
})
export class ProfileComponent implements OnInit, OnDestroy {
  profileForm: FormGroup;
  userName = '';
  email = '';
  steamId = '';
  position = '';
  readonly positionOptions = PLAYER_POSITIONS;
  readonly highlightsFeatureEnabled = HIGHLIGHTS_FEATURE_ENABLED;
  getHighlightTypeLabel = getHighlightTypeLabel;
  getHighlightRenderLabel = getHighlightRenderLabel;
  getHighlightTypeAccent = getHighlightTypeAccent;
  getHighlightRenderBadgeClass = getHighlightRenderBadgeClass;
  avatarUrl: string | null = null;
  role = '';
  successMsg = '';
  errorMsg = '';
  uploadingAvatar = false;
  avatarBroken = false;
  activeTab: ProfileTab = 'stats';
  statsOverview: PersonalStatsOverview | null = null;
  statsLoading = true;
  personalDemos: Demo[] = [];
  demosLoading = true;
  personalHighlights: PersonalHighlightEntry[] = [];
  highlightsLoading = false;
  highlightsLoadError = '';
  deletingHighlightId = '';
  deletingAllHighlights = false;
  showUploadModal = false;
  reprocessingId: string | null = null;
  deletingId: string | null = null;
  requeueAllLoading = false;
  demoQueueAvailable = true;
  private listPollSub?: Subscription;
  private highlightsPollSub?: Subscription;
  private readonly stuckPendingMs = 2 * 60 * 1000;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private demoService: DemoService,
    private notify: NotificationService,
    private router: Router,
    private route: ActivatedRoute
  ) {
    this.profileForm = this.fb.group({
      displayName: ['', Validators.required],
      steamId: [''],
      position: [''],
    });
  }

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      const tab = params.get('tab');
      if (tab === 'demos' || tab === 'settings' || tab === 'stats') {
        this.activeTab = tab;
      } else if (tab === 'highlights' && HIGHLIGHTS_FEATURE_ENABLED) {
        this.activeTab = tab;
        this.loadPersonalHighlights();
      }
    });

    this.authService.getMe().subscribe({
      next: (user) => {
        this.userName = user.displayName;
        this.email = user.email;
        this.steamId = user.steamId || '';
        this.position = normalizePlayerPositionForForm(user.position);
        this.avatarUrl = user.avatarUrl || null;
        this.avatarBroken = false;
        this.role = user.role;
        this.profileForm.patchValue({
          displayName: user.displayName,
          steamId: user.steamId || '',
          position: this.position,
        });
      },
      error: () => {
        this.errorMsg = 'Erro ao carregar perfil.';
      }
    });

    this.loadStatsOverview();
    this.loadPersonalDemos();
    this.loadDemoQueueHealth();
    if (HIGHLIGHTS_FEATURE_ENABLED && this.activeTab === 'highlights') {
      this.loadPersonalHighlights();
    }
  }

  ngOnDestroy(): void {
    this.listPollSub?.unsubscribe();
    this.highlightsPollSub?.unsubscribe();
  }

  loadStatsOverview(): void {
    this.statsLoading = true;
    this.demoService.getPersonalStatsOverview().subscribe({
      next: (overview) => {
        this.statsOverview = overview;
        this.statsLoading = false;
      },
      error: () => {
        this.statsLoading = false;
      }
    });
  }

  loadPersonalHighlights(): void {
    this.highlightsLoading = true;
    this.highlightsLoadError = '';
    this.demoService.listPersonalHighlights().subscribe({
      next: (response) => {
        this.personalHighlights = response.highlights;
        this.highlightsLoading = false;
        this.setupHighlightsPolling();
      },
      error: (err) => {
        this.highlightsLoading = false;
        this.personalHighlights = [];
        const apiMessage = typeof err?.error?.error === 'string' ? err.error.error : '';
        if (err?.status === 0) {
          this.highlightsLoadError = 'Não foi possível conectar à API. Verifique se o backend está rodando.';
        } else if (err?.status === 404) {
          this.highlightsLoadError = 'Destaques indisponíveis nesta versão da API. Faça o deploy do backend mais recente.';
        } else if (err?.status === 503 && apiMessage) {
          this.highlightsLoadError = apiMessage;
        } else {
          this.highlightsLoadError = apiMessage || 'Erro ao carregar destaques.';
        }
        if (this.activeTab === 'highlights') {
          this.notify.error(this.highlightsLoadError);
        }
      },
    });
  }

  setupHighlightsPolling(): void {
    this.highlightsPollSub?.unsubscribe();
    if (!hasHighlightVideoRendering(this.personalHighlights)) {
      return;
    }

    this.highlightsPollSub = interval(4000).pipe(
      startWith(0),
      switchMap(() => this.demoService.listPersonalHighlights()),
      takeWhile((response) => hasHighlightVideoRendering(response.highlights), true)
    ).subscribe({
      next: (response) => {
        this.personalHighlights = response.highlights;
      },
    });
  }

  get hasPersonalHighlights(): boolean {
    return this.personalHighlights.length > 0;
  }

  get hasRenderingHighlights(): boolean {
    return hasHighlightVideoRendering(this.personalHighlights);
  }

  loadPersonalDemos(): void {
    this.demosLoading = true;
    this.demoService.listPersonalDemos().subscribe({
      next: (demos) => {
        this.personalDemos = demos;
        this.demosLoading = false;
        this.setupListPolling();
      },
      error: () => {
        this.demosLoading = false;
      }
    });
  }

  get summary() {
    return this.statsOverview?.summary;
  }

  get demoStats(): PersonalDemoStat[] {
    return this.statsOverview?.demos || [];
  }

  get recentDemos(): PersonalDemoStat[] {
    return this.demoStats.slice(0, 20);
  }

  get hasStats(): boolean {
    return (this.summary?.demosCompleted || 0) > 0;
  }

  get performanceAnalytics() {
    return this.statsOverview?.analytics ?? null;
  }

  get hasPendingDemos(): boolean {
    return this.personalDemos.some((d) => d.status === 'pending' || d.status === 'processing');
  }

  get hasProcessingDemos(): boolean {
    return this.personalDemos.some((d) => d.status === 'processing');
  }

  get hasStuckPendingDemos(): boolean {
    return this.personalDemos.some((d) => this.isDemoStuck(d));
  }

  get requeueableCount(): number {
    return this.personalDemos.filter((d) => d.status === 'pending' || d.status === 'failed').length;
  }

  loadDemoQueueHealth(): void {
    this.demoService.getDemoHealthConfig().subscribe({
      next: (config) => {
        this.demoQueueAvailable = config.redis?.queueAvailable !== false && !(config.redisErrors?.length);
      },
      error: () => {
        this.demoQueueAvailable = false;
      },
    });
  }

  isDemoStuck(demo: Demo): boolean {
    if (demo.status !== 'pending' && demo.status !== 'processing') {
      return false;
    }
    const since = demo.updatedAt || demo.createdAt;
    if (!since) return false;
    return Date.now() - new Date(since).getTime() > this.stuckPendingMs;
  }

  setupListPolling(): void {
    this.listPollSub?.unsubscribe();
    if (!this.hasPendingDemos) return;

    const previouslyPending = this.personalDemos.filter(
      (d) => d.status === 'pending' || d.status === 'processing'
    );

    this.listPollSub = this.demoService.pollPendingPersonalDemos().subscribe({
      next: (demos) => {
        for (const prev of previouslyPending) {
          const now = demos.find((d) => d.id === prev.id);
          if (now?.status === 'completed' && prev.status !== 'completed') {
            this.notify.success(`Demo pessoal processada: ${now.fileName}`);
            this.loadStatsOverview();
          }
        }
        this.personalDemos = demos;
      }
    });
  }

  setTab(tab: ProfileTab): void {
    if (tab === 'highlights' && !HIGHLIGHTS_FEATURE_ENABLED) {
      return;
    }
    this.activeTab = tab;
    if (tab === 'highlights') {
      this.loadPersonalHighlights();
    }
  }

  gaugePercent(value: number, max: number): number {
    return Math.min(Math.max((value / max) * 100, 0), 100);
  }

  kdGaugePercent(): number {
    return this.gaugePercent(this.summary?.kd || 0, 2);
  }

  ratingGaugePercent(): number {
    return this.gaugePercent(this.summary?.rating || 0, 2);
  }

  kastGaugePercent(): number {
    return this.gaugePercent(this.summary?.kast || 0, 100);
  }

  kdaGaugePercent(): number {
    return this.gaugePercent(this.summary?.kda || 0, 3);
  }

  impactGaugePercent(): number {
    const diff = this.summary?.kdDiff || 0;
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

  hsGaugePercent(): number {
    return this.gaugePercent(this.summary?.hsPercent || 0, 100);
  }

  adrGaugePercent(): number {
    return this.gaugePercent(this.summary?.adr || 0, 120);
  }

  demoGridClass(status: string): string {
    if (status === 'completed') return 'dot-completed';
    if (status === 'failed') return 'dot-failed';
    if (status === 'processing') return 'dot-processing';
    return 'dot-pending';
  }

  shortFileName(name: string): string {
    if (name.length <= 28) return name;
    return name.slice(0, 12) + '…' + name.slice(-12);
  }

  formatDate(date?: string): string {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  }

  get avatarSrc(): string | null {
    if (!this.avatarUrl || this.avatarBroken) return null;
    return resolveUploadAssetUrl(this.avatarUrl);
  }

  onAvatarError(): void {
    this.avatarBroken = true;
  }

  get positionLabel(): string {
    return getPlayerPositionLabel(this.position) || 'Não definida';
  }

  formatPosition(position: string): string {
    return getPlayerPositionLabel(position);
  }

  onUpdateProfile(): void {
    if (!this.profileForm.valid) return;

    const { displayName, steamId, position } = this.profileForm.value;
    this.authService.updateProfile({
      displayName,
      steamId,
      position: position?.trim() || null,
    }).subscribe({
      next: (user) => {
        this.userName = user.displayName;
        this.steamId = user.steamId || '';
        this.position = normalizePlayerPositionForForm(user.position);
        this.avatarUrl = user.avatarUrl || null;
        this.avatarBroken = false;
        this.profileForm.patchValue({
          displayName: user.displayName,
          steamId: user.steamId || '',
          position: this.position,
        });
        this.successMsg = 'Perfil atualizado com sucesso!';
        this.errorMsg = '';
      },
      error: (err) => {
        this.errorMsg = err.error?.error || 'Erro ao atualizar perfil.';
      }
    });
  }

  onAvatarSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      this.notify.warning('A imagem deve ter no máximo 2 MB.', 'Arquivo grande');
      input.value = '';
      return;
    }

    this.uploadingAvatar = true;
    this.authService.uploadAvatar(file).subscribe({
      next: (user) => {
        this.avatarUrl = user.avatarUrl || null;
        this.avatarBroken = false;
        this.uploadingAvatar = false;
        input.value = '';
        this.successMsg = 'Foto de perfil atualizada!';
        this.errorMsg = '';
        this.notify.success('Foto de perfil atualizada.', 'Perfil');
      },
      error: (err) => {
        this.uploadingAvatar = false;
        input.value = '';
        this.errorMsg = err.error?.error || 'Erro ao enviar foto de perfil.';
        this.notify.error(this.errorMsg);
      }
    });
  }

  removeAvatar(): void {
    if (!this.avatarUrl) return;

    this.uploadingAvatar = true;
    this.authService.removeAvatar().subscribe({
      next: (user) => {
        this.avatarUrl = user.avatarUrl || null;
        this.avatarBroken = false;
        this.uploadingAvatar = false;
        this.successMsg = 'Foto de perfil removida.';
        this.errorMsg = '';
        this.notify.success('Foto de perfil removida.', 'Perfil');
      },
      error: (err) => {
        this.uploadingAvatar = false;
        this.errorMsg = err.error?.error || 'Erro ao remover foto de perfil.';
        this.notify.error(this.errorMsg);
      }
    });
  }

  connectSteam(): void {
    this.notify.info(
      'Edite o Steam ID manualmente no formulário abaixo.',
      'Steam em breve',
      { hint: 'A conexão automática com Steam será implementada em uma fase futura.' }
    );
  }

  openUploadModal(): void {
    if (!this.steamId?.trim()) {
      this.notify.warning('Configure seu Steam ID antes de enviar uma demo pessoal.');
      this.setTab('settings');
      return;
    }
    this.showUploadModal = true;
  }

  closeUploadModal(): void {
    this.showUploadModal = false;
  }

  onDemoUploaded(_demo: Demo): void {
    this.showUploadModal = false;
    this.loadPersonalDemos();
    this.loadStatsOverview();
    this.setTab('stats');
  }

  viewDemo(demoId: string): void {
    this.router.navigate(['/demo', demoId]);
  }

  requeueAllPending(): void {
    if (this.requeueAllLoading || this.requeueableCount === 0) return;

    this.requeueAllLoading = true;
    this.demoService.requeuePendingPersonalDemos().subscribe({
      next: (result) => {
        this.requeueAllLoading = false;
        if (result.requeued > 0) {
          this.notify.success(
            `${result.requeued} demo(s) reenfileirada(s). Aguarde o worker processar.`
          );
        } else if (result.total === 0) {
          this.notify.info('Nenhuma demo pendente para reenfileirar.');
        } else {
          this.notify.warning('Nenhuma demo pôde ser reenfileirada. Verifique se o worker está online.');
        }
        if (result.skipped.length > 0) {
          this.notify.warning(
            `${result.skipped.length} demo(s) sem arquivo no servidor (volume compartilhado entre API e worker).`
          );
        }
        this.loadPersonalDemos();
      },
      error: (err) => {
        this.requeueAllLoading = false;
        this.notify.error(err.error?.error || 'Erro ao reenfileirar demos pendentes');
      },
    });
  }

  reprocessDemo(demo: Demo): void {
    this.reprocessingId = demo.id;
    this.demoService.reprocessDemo(demo.id).subscribe({
      next: () => {
        this.reprocessingId = null;
        this.notify.info('Demo reenfileirada para processamento.');
        this.loadPersonalDemos();
      },
      error: (err) => {
        this.reprocessingId = null;
        const msg = err.error?.error || 'Erro ao reprocessar demo';
        if (err.error?.code === 'DEMO_FILE_NOT_FOUND') {
          this.notify.error(msg, 'Arquivo perdido', {
            hint: 'Configure o volume /data na Railway (API + worker) e envie a demo de novo.',
          });
          this.loadPersonalDemos();
          return;
        }
        this.notify.error(msg);
      }
    });
  }

  deleteDemo(demo: Demo): void {
    this.deletingId = demo.id;
    this.demoService.deleteDemo(demo.id).subscribe({
      next: () => {
        this.deletingId = null;
        this.notify.success('Demo excluída.');
        this.loadPersonalDemos();
        this.loadStatsOverview();
      },
      error: (err) => {
        this.deletingId = null;
        this.notify.error(err.error?.error || 'Erro ao excluir demo');
      }
    });
  }

  canReprocess(demo: Demo): boolean {
    return demo.status === 'pending' || demo.status === 'failed';
  }

  canDelete(demo: Demo): boolean {
    return demo.status !== 'processing';
  }

  isDemoProcessing(demo: Demo): boolean {
    return demo.status === 'pending' || demo.status === 'processing';
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      pending: 'Aguardando',
      processing: 'Processando',
      completed: 'Concluído',
      failed: 'Falhou',
    };
    return labels[status] || status;
  }

  canDownloadHighlightVideo(highlight: PersonalHighlightEntry): boolean {
    return highlight.clipRenderStatus === 'COMPLETED' && !!highlight.clipVideoUrl;
  }

  isHighlightVideoRendering(highlight: PersonalHighlightEntry): boolean {
    return highlight.clipRenderStatus === 'PENDING' || highlight.clipRenderStatus === 'PROCESSING';
  }

  downloadHighlightClip(highlight: PersonalHighlightEntry): void {
    if (!highlight.demoId) return;
    this.demoService.downloadDemoHighlightClip(highlight.demoId, highlight.id).subscribe({
      next: (blob) => this.saveHighlightBlob(blob, highlight.id, 'vdm.txt', 'Spec de clipe baixada.'),
      error: (err) => this.notify.error(err.error?.error || 'Erro ao baixar spec do clipe.'),
    });
  }

  downloadHighlightVideo(highlight: PersonalHighlightEntry): void {
    if (!highlight.demoId) return;
    this.demoService.downloadDemoHighlightVideo(highlight.demoId, highlight.id).subscribe({
      next: (blob) => this.saveHighlightBlob(blob, highlight.id, 'mp4', 'Vídeo MP4 baixado.'),
      error: (err) => this.notify.error(err.error?.error || 'Erro ao baixar vídeo do destaque.'),
    });
  }

  deleteHighlight(highlight: PersonalHighlightEntry): void {
    if (!highlight.demoId) return;
    const label = `${highlight.playerName} · Round ${highlight.round}`;
    if (!confirm(`Excluir o destaque "${label}"?`)) return;

    this.deletingHighlightId = highlight.id;
    this.demoService.deleteDemoHighlight(highlight.demoId, highlight.id).subscribe({
      next: () => {
        this.deletingHighlightId = '';
        this.personalHighlights = this.personalHighlights.filter((h) => h.id !== highlight.id);
        this.notify.success('Destaque excluído.');
      },
      error: (err) => {
        this.deletingHighlightId = '';
        this.notify.error(err.error?.error || 'Erro ao excluir destaque.');
      },
    });
  }

  deleteAllHighlights(): void {
    if (!this.hasPersonalHighlights) return;
    if (!confirm(`Excluir todos os ${this.personalHighlights.length} destaque(s)?`)) return;

    this.deletingAllHighlights = true;
    this.demoService.deleteAllPersonalHighlights().subscribe({
      next: (res) => {
        this.deletingAllHighlights = false;
        this.personalHighlights = [];
        this.notify.success(`${res.deleted} destaque(s) excluído(s).`);
      },
      error: (err) => {
        this.deletingAllHighlights = false;
        this.notify.error(err.error?.error || 'Erro ao excluir destaques.');
      },
    });
  }

  private saveHighlightBlob(blob: Blob, highlightId: string, extension: string, successMessage: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `highlight-${highlightId.slice(0, 8)}.${extension}`;
    a.click();
    URL.revokeObjectURL(url);
    this.notify.success(successMessage);
  }
}
