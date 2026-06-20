import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { DemoService } from '../../Services/demo.service';
import { NotificationService } from '../../Services/notification.service';
import { Demo } from '../../Models/interfaces';
import { DemoUploadModalComponent } from '../../Components/demo-upload-modal/demo-upload-modal.component';
import { DemoStatusLoaderComponent } from '../../Components/demo-status-loader/demo-status-loader.component';

@Component({
  selector: 'app-demo-upload',
  standalone: true,
  imports: [CommonModule, RouterModule, DemoUploadModalComponent, DemoStatusLoaderComponent],
  templateUrl: './demo-upload.component.html',
  styleUrls: ['./demo-upload.component.css']
})
export class DemoUploadComponent implements OnInit, OnDestroy {
  demos: Demo[] = [];
  loading = true;
  showUploadModal = false;
  uploadPrefillLeagueId = '';
  uploadPrefillMatchId = '';
  processingDemo: Demo | null = null;
  pollStatus = '';
  disassociatingId: string | null = null;
  reprocessingId: string | null = null;
  deletingId: string | null = null;
  errorMsg = '';
  private listPollSub?: Subscription;

  constructor(
    private demoService: DemoService,
    private notificationService: NotificationService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.loadDemos();

    const params = this.route.snapshot.queryParams;
    if (params['leagueId']) {
      this.uploadPrefillLeagueId = params['leagueId'];
      this.uploadPrefillMatchId = params['matchId'] || '';
      this.showUploadModal = true;
    }
  }

  ngOnDestroy(): void {
    this.listPollSub?.unsubscribe();
  }

  loadDemos(): void {
    this.loading = true;
    this.demoService.listDemos().subscribe({
      next: (demos) => {
        this.demos = demos;
        this.loading = false;
        this.setupListPolling();
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  get hasPendingDemos(): boolean {
    return this.demos.some((d) => d.status === 'pending' || d.status === 'processing');
  }

  setupListPolling(): void {
    this.listPollSub?.unsubscribe();
    if (!this.hasPendingDemos) return;

    this.listPollSub = this.demoService.pollPendingDemos().subscribe({
      next: (demos) => {
        const previouslyPending = this.demos.filter(
          (d) => d.status === 'pending' || d.status === 'processing'
        );
        this.demos = demos;

        if (this.processingDemo) {
          const updated = demos.find((d) => d.id === this.processingDemo!.id);
          if (updated) {
            this.processingDemo = updated;
            this.pollStatus = updated.status;
          }
        }

        for (const prev of previouslyPending) {
          const now = demos.find((d) => d.id === prev.id);
          if (now?.status === 'completed' && prev.status !== 'completed') {
            this.notificationService.success(`Demo processada: ${now.fileName}`);
          }
        }
      }
    });
  }

  openUploadModal(): void {
    this.uploadPrefillLeagueId = '';
    this.uploadPrefillMatchId = '';
    this.showUploadModal = true;
  }

  closeUploadModal(): void {
    this.showUploadModal = false;
    this.uploadPrefillLeagueId = '';
    this.uploadPrefillMatchId = '';
  }

  onDemoUploaded(demo: Demo): void {
    this.showUploadModal = false;
    this.uploadPrefillLeagueId = '';
    this.uploadPrefillMatchId = '';
    this.processingDemo = demo;
    this.pollStatus = demo.status;
    this.loadDemos();
  }

  viewDemo(demoId: string): void {
    this.router.navigate(['/demo', demoId]);
  }

  reprocessDemo(demo: Demo, event?: Event): void {
    event?.stopPropagation();
    this.reprocessingId = demo.id;
    this.demoService.reprocessDemo(demo.id).subscribe({
      next: (updated) => {
        this.reprocessingId = null;
        this.processingDemo = updated;
        this.pollStatus = updated.status;
        this.notificationService.info('Demo reenfileirada para processamento.');
        this.loadDemos();
      },
      error: (err) => {
        this.reprocessingId = null;
        this.notificationService.error(err.error?.error || 'Erro ao reprocessar demo');
      }
    });
  }

  disassociateDemo(demo: Demo, event?: Event): void {
    event?.stopPropagation();
    this.disassociatingId = demo.id;
    this.demoService.disassociateMatch(demo.id).subscribe({
      next: () => {
        this.disassociatingId = null;
        this.notificationService.success('Demo desassociada da partida.');
        this.loadDemos();
      },
      error: (err) => {
        this.disassociatingId = null;
        this.notificationService.error(err.error?.error || 'Erro ao desassociar demo');
      }
    });
  }

  deleteDemo(demo: Demo, event?: Event): void {
    event?.stopPropagation();
    this.deletingId = demo.id;
    this.demoService.deleteDemo(demo.id).subscribe({
      next: () => {
        this.deletingId = null;
        this.notificationService.success('Demo excluída.');
        this.loadDemos();
      },
      error: (err) => {
        this.deletingId = null;
        this.notificationService.error(err.error?.error || 'Erro ao excluir demo');
      }
    });
  }

  canReprocess(demo: Demo): boolean {
    return demo.status === 'pending' || demo.status === 'failed';
  }

  canDisassociate(demo: Demo): boolean {
    return !!demo.matchId && demo.status !== 'processing';
  }

  canDelete(demo: Demo): boolean {
    return demo.status !== 'processing' && !(demo.status === 'completed' && demo.matchId);
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

  getMatchLabel(demo: Demo): string {
    if (!demo.match) return '';
    return `${demo.match.team1?.name} vs ${demo.match.team2?.name}`;
  }
}
