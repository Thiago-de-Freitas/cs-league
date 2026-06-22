import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { MatchService } from '../../Services/match.service';
import { DemoService } from '../../Services/demo.service';
import { NotificationService } from '../../Services/notification.service';
import { Demo, Match, MatchPlayerStat } from '../../Models/interfaces';
import { DemoUploadModalComponent } from '../../Components/demo-upload-modal/demo-upload-modal.component';
import { DemoStatusLoaderComponent } from '../../Components/demo-status-loader/demo-status-loader.component';
import { CS2_MAPS } from '../../Utils/maps';
import { resolveBracketSize } from '../../Utils/bracket.util';

@Component({
  selector: 'app-match-details',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, DemoUploadModalComponent, DemoStatusLoaderComponent],
  templateUrl: './match-details.component.html',
  styleUrls: ['./match-details.component.css']
})
export class MatchDetailsComponent implements OnInit, OnDestroy {
  matchId: string | null = null;
  match: Match | null = null;
  demo: Demo | null = null;
  stats: MatchPlayerStat[] = [];
  loading = true;
  errorMsg = '';
  isDemoView = false;
  showUploadModal = false;
  pollingDemo = false;
  resultModalMatch: Match | null = null;
  resultModalWinnerId = '';
  resultModalMap = '';
  resultModalLoading = false;
  cs2Maps = CS2_MAPS;
  private pollSub?: Subscription;

  constructor(
    private route: ActivatedRoute,
    private matchService: MatchService,
    private demoService: DemoService,
    private notify: NotificationService
  ) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      if (!id) return;
      this.matchId = id;
      const isDemoRoute = this.route.snapshot.url.some((s) => s.path === 'demo');
      if (isDemoRoute) {
        this.loadDemo(id);
      } else {
        this.loadMatch(id);
      }
    });
  }

  ngOnDestroy(): void {
    this.pollSub?.unsubscribe();
  }

  loadDemo(id: string): void {
    this.loading = true;
    this.isDemoView = true;
    this.demoService.getDemo(id).subscribe({
      next: (demo) => {
        this.demo = demo;
        this.stats = demo.stats || [];
        this.loading = false;
        if (demo.status === 'pending' || demo.status === 'processing') {
          this.startDemoViewPolling(id);
        }
      },
      error: () => {
        this.errorMsg = 'Demo não encontrada.';
        this.loading = false;
      }
    });
  }

  startDemoViewPolling(id: string): void {
    this.pollSub?.unsubscribe();
    this.pollingDemo = true;
    this.pollSub = this.demoService.pollDemoStatus(id).subscribe({
      next: (demo) => {
        this.demo = demo;
        if (demo.status === 'completed') {
          this.stats = demo.stats || [];
          this.pollingDemo = false;
        } else if (demo.status === 'failed') {
          this.pollingDemo = false;
        }
      }
    });
  }

  reprocessDemo(): void {
    if (!this.demo) return;
    this.demoService.reprocessDemo(this.demo.id).subscribe({
      next: (updated) => {
        this.demo = updated;
        this.pollingDemo = true;
        this.startDemoViewPolling(updated.id);
      },
      error: (err) => {
        this.errorMsg = err.error?.error || 'Erro ao reprocessar demo';
      }
    });
  }

  loadMatch(id: string): void {
    this.loading = true;
    this.isDemoView = false;
    this.matchService.getMatch(id).subscribe({
      next: (match) => {
        this.match = match;
        this.stats = match.aggregatedStats || this.buildAggregatedStats(match.demos || []);
        this.loading = false;
        this.startPollingPendingDemos();
      },
      error: (err) => {
        this.errorMsg = err.status === 403
          ? 'Sem permissão para visualizar esta partida.'
          : 'Partida não encontrada.';
        this.loading = false;
      }
    });
  }

  buildAggregatedStats(demos: Demo[]): MatchPlayerStat[] {
    const byKey = new Map<string, MatchPlayerStat>();
    for (const demo of demos) {
      if (demo.status !== 'completed' || !demo.stats?.length) continue;
      for (const stat of demo.stats) {
        const key = (stat.steamId || stat.playerName).toLowerCase();
        if (!byKey.has(key)) byKey.set(key, stat);
      }
    }
    return Array.from(byKey.values()).sort((a, b) => b.kills - a.kills);
  }

  startPollingPendingDemos(): void {
    this.pollSub?.unsubscribe();
    const pending = this.match?.demos?.filter(
      (d) => d.status === 'pending' || d.status === 'processing'
    );
    if (!pending?.length || !this.matchId) return;

    this.pollingDemo = true;
    const pollId = pending[0].id;
    this.pollSub = this.demoService.pollDemoStatus(pollId).subscribe({
      next: (updated) => {
        if (this.match?.demos) {
          const idx = this.match.demos.findIndex((d) => d.id === updated.id);
          if (idx >= 0) this.match.demos[idx] = updated;
        }
        if (updated.status === 'completed' || updated.status === 'failed') {
          this.pollingDemo = false;
          this.refreshMatch();
        }
      }
    });
  }

  refreshMatch(): void {
    if (!this.matchId) return;
    this.matchService.getMatch(this.matchId).subscribe({
      next: (match) => {
        this.match = match;
        this.stats = match.aggregatedStats || this.buildAggregatedStats(match.demos || []);
        this.startPollingPendingDemos();
      }
    });
  }

  viewDemoStats(demo: Demo): void {
    this.stats = demo.stats || [];
    this.demo = demo;
  }

  openUploadModal(): void {
    this.showUploadModal = true;
  }

  closeUploadModal(): void {
    this.showUploadModal = false;
  }

  onDemoUploaded(_demo: Demo): void {
    this.showUploadModal = false;
    this.refreshMatch();
  }

  getKd(stat: MatchPlayerStat): string {
    return stat.deaths > 0 ? (stat.kills / stat.deaths).toFixed(2) : stat.kills.toString();
  }

  isDemoProcessing(demo: Demo): boolean {
    return demo.status === 'pending' || demo.status === 'processing';
  }

  getDemoStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      pending: 'Aguardando',
      processing: 'Processando',
      completed: 'Concluída',
      failed: 'Falhou',
    };
    return labels[status] || status;
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      scheduled: 'Agendada',
      in_progress: 'Em andamento',
      completed: 'Finalizada',
      cancelled: 'Cancelada',
      pending: 'Aguardando',
      processing: 'Processando',
      failed: 'Falhou',
    };
    return labels[status] || status;
  }

  get canRegisterResult(): boolean {
    return !!this.match?.permissions?.canRegisterResult;
  }

  registerResult(winnerId: string): void {
    if (!this.match) return;
    this.resultModalMatch = this.match;
    this.resultModalWinnerId = winnerId;
    this.resultModalMap = this.match.map || '';
    this.resultModalLoading = false;
  }

  closeResultModal(): void {
    if (this.resultModalLoading) return;
    this.resultModalMatch = null;
    this.resultModalWinnerId = '';
    this.resultModalMap = '';
  }

  confirmResultModal(): void {
    if (!this.resultModalMatch || !this.resultModalWinnerId) return;
    this.resultModalLoading = true;
    const map = this.resultModalMap || undefined;
    this.matchService.registerResult(this.resultModalMatch.id, this.resultModalWinnerId, map).subscribe({
      next: () => {
        this.resultModalLoading = false;
        this.closeResultModal();
        this.refreshMatch();
        this.notify.success('Resultado registrado com sucesso.');
      },
      error: (err) => {
        this.resultModalLoading = false;
        this.notify.error(err.error?.error || 'Erro ao registrar resultado');
      },
    });
  }

  get resultWinnerLabel(): string {
    if (!this.resultModalMatch) return '';
    const winner =
      this.resultModalMatch.team1.id === this.resultModalWinnerId
        ? this.resultModalMatch.team1
        : this.resultModalMatch.team2;
    return winner.name;
  }

  getRoundLabel(round?: number): string {
    if (!round || !this.match?.league) return '';
    const league = this.match.league as { bracketSize?: number | null; maxTeams?: number | null };
    const bracketSize = resolveBracketSize(0, league.bracketSize ?? league.maxTeams);
    const total = Math.log2(bracketSize);
    const remaining = total - round + 1;
    if (remaining === 1) return 'Final';
    if (remaining === 2) return 'Semifinal';
    if (remaining === 3) return 'Quartas';
    return `Rodada ${round}`;
  }
}
