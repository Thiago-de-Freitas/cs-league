import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../Services/auth.service';
import { DemoService } from '../../Services/demo.service';
import { NotificationService } from '../../Services/notification.service';
import { Demo, PersonalDemoStat, PersonalStatsOverview } from '../../Models/interfaces';
import { DemoUploadModalComponent } from '../../Components/demo-upload-modal/demo-upload-modal.component';
import { DemoStatusLoaderComponent } from '../../Components/demo-status-loader/demo-status-loader.component';

type ProfileTab = 'stats' | 'demos' | 'settings';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, DemoUploadModalComponent, DemoStatusLoaderComponent],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css']
})
export class ProfileComponent implements OnInit, OnDestroy {
  profileForm: FormGroup;
  userName = '';
  email = '';
  steamId = '';
  avatarUrl: string | null = null;
  role = '';
  successMsg = '';
  errorMsg = '';
  uploadingAvatar = false;
  activeTab: ProfileTab = 'stats';
  statsOverview: PersonalStatsOverview | null = null;
  statsLoading = true;
  personalDemos: Demo[] = [];
  demosLoading = true;
  showUploadModal = false;
  reprocessingId: string | null = null;
  deletingId: string | null = null;
  requeueAllLoading = false;
  demoQueueAvailable = true;
  private listPollSub?: Subscription;
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
    });
  }

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      const tab = params.get('tab');
      if (tab === 'demos' || tab === 'settings' || tab === 'stats') {
        this.activeTab = tab;
      }
    });

    this.authService.getMe().subscribe({
      next: (user) => {
        this.userName = user.displayName;
        this.email = user.email;
        this.steamId = user.steamId || '';
        this.avatarUrl = user.avatarUrl || null;
        this.role = user.role;
        this.profileForm.patchValue({
          displayName: user.displayName,
          steamId: user.steamId || '',
        });
      },
      error: () => {
        this.errorMsg = 'Erro ao carregar perfil.';
      }
    });

    this.loadStatsOverview();
    this.loadPersonalDemos();
    this.loadDemoQueueHealth();
  }

  ngOnDestroy(): void {
    this.listPollSub?.unsubscribe();
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
        this.demoQueueAvailable = true;
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
    this.activeTab = tab;
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

  onUpdateProfile(): void {
    if (!this.profileForm.valid) return;

    this.authService.updateProfile(this.profileForm.value).subscribe({
      next: (user) => {
        this.userName = user.displayName;
        this.steamId = user.steamId || '';
        this.avatarUrl = user.avatarUrl || null;
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
}
