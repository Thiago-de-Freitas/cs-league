import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { MatchService } from '../../Services/match.service';
import { AuthService } from '../../Services/auth.service';
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
  resultModalTeam1Rounds: number | null = null;
  resultModalTeam2Rounds: number | null = null;
  resultModalMap = '';
  resultModalLoading = false;
  rescheduleDateTime = '';
  rescheduleLoading = false;
  showReschedule = false;
  cs2Maps = CS2_MAPS;
  private pollSub?: Subscription;

  constructor(
    private route: ActivatedRoute,
    private matchService: MatchService,
    private authService: AuthService,
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

  registerResult(): void {
    if (!this.match) return;
    this.resultModalMatch = this.match;
    this.resultModalTeam1Rounds = null;
    this.resultModalTeam2Rounds = null;
    this.resultModalMap = this.match.map || '';
    this.resultModalLoading = false;
  }

  closeResultModal(): void {
    if (this.resultModalLoading) return;
    this.resultModalMatch = null;
    this.resultModalTeam1Rounds = null;
    this.resultModalTeam2Rounds = null;
    this.resultModalMap = '';
  }

  get canConfirmResultModal(): boolean {
    if (!this.resultModalMatch) return false;
    const r1 = Number(this.resultModalTeam1Rounds);
    const r2 = Number(this.resultModalTeam2Rounds);
    if (!Number.isInteger(r1) || !Number.isInteger(r2) || r1 < 0 || r2 < 0) return false;
    if (r1 === 0 && r2 === 0) return false;
    if (this.resultModalMatch.phase === 'playoff' && r1 === r2) return false;
    return true;
  }

  confirmResultModal(): void {
    if (!this.resultModalMatch || !this.canConfirmResultModal) return;
    this.resultModalLoading = true;
    const map = this.resultModalMap || undefined;
    const r1 = Number(this.resultModalTeam1Rounds);
    const r2 = Number(this.resultModalTeam2Rounds);
    this.matchService.registerResult(this.resultModalMatch.id, r1, r2, map).subscribe({
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

  get resultOutcomeLabel(): string {
    if (!this.resultModalMatch) return '';
    const r1 = Number(this.resultModalTeam1Rounds);
    const r2 = Number(this.resultModalTeam2Rounds);
    if (!Number.isInteger(r1) || !Number.isInteger(r2) || r1 < 0 || r2 < 0) {
      return 'Informe o placar de rounds dos dois times.';
    }
    if (r1 === 0 && r2 === 0) return 'Placar inválido.';
    if (r1 === r2) {
      return this.resultModalMatch.phase === 'playoff'
        ? 'Empate não é permitido no mata-mata.'
        : `Empate (${r1} x ${r2}) — 1 ponto para cada time.`;
    }
    const winner = r1 > r2 ? this.resultModalMatch.team1 : this.resultModalMatch.team2;
    return `Vitória ${winner.name} (${Math.max(r1, r2)} x ${Math.min(r1, r2)}) — 3 pontos.`;
  }

  get canReschedule(): boolean {
    if (!this.match?.league?.ownerId || this.match.status === 'completed' || this.match.status === 'cancelled') {
      return false;
    }
    return this.authService.isLeagueOwner(this.match.league.ownerId);
  }

  openReschedule(): void {
    if (!this.match) return;
    this.rescheduleDateTime = this.toDatetimeLocalValue(this.match.scheduledAt);
    this.showReschedule = true;
  }

  closeReschedule(): void {
    if (this.rescheduleLoading) return;
    this.showReschedule = false;
    this.rescheduleDateTime = '';
  }

  confirmReschedule(): void {
    if (!this.match || !this.rescheduleDateTime) return;
    const iso = new Date(this.rescheduleDateTime).toISOString();
    this.rescheduleLoading = true;
    this.matchService.rescheduleMatch(this.match.id, iso).subscribe({
      next: (updated) => {
        this.match = { ...this.match!, scheduledAt: updated.scheduledAt };
        this.rescheduleLoading = false;
        this.closeReschedule();
        this.notify.success('Jogo remarcado.');
      },
      error: (err) => {
        this.rescheduleLoading = false;
        this.notify.error(err?.error?.error || 'Erro ao remarcar jogo.');
      },
    });
  }

  private toDatetimeLocalValue(value?: string | null): string {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
