import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription, forkJoin, interval } from 'rxjs';
import { startWith, switchMap, takeWhile } from 'rxjs/operators';
import { MatchService } from '../../Services/match.service';
import { AuthService } from '../../Services/auth.service';
import { DemoService } from '../../Services/demo.service';
import { NotificationService } from '../../Services/notification.service';
import { Demo, Match, MatchHighlight, MatchPlayerStat, MatchRosterPlayer, ManualPlayerStatInput } from '../../Models/interfaces';
import { DemoUploadModalComponent } from '../../Components/demo-upload-modal/demo-upload-modal.component';
import { DemoStatusLoaderComponent } from '../../Components/demo-status-loader/demo-status-loader.component';
import { MatchMapVetoComponent } from '../../Components/match-map-veto/match-map-veto.component';
import { SeriesMapVetoComponent } from '../../Components/series-map-veto/series-map-veto.component';
import { CS2_MAPS, getMapLabel } from '../../Utils/maps';
import { resolveBracketSize } from '../../Utils/bracket.util';
import {
  formatSeriesMapWins,
  isBo3Match as checkIsBo3Match,
  showMatchMapVeto,
  showSeriesVetoPanel,
} from '../../Utils/match-series-view.util';
import {
  getHighlightTypeAccent,
  getHighlightRenderBadgeClass,
  getHighlightRenderLabel,
  getHighlightTypeLabel,
} from '../../Utils/highlight-display.util';
import {
  clearHighlightGeneratePending,
  createHighlightSnapshot,
  findHighlightGeneratePendingForDemo,
  findHighlightGeneratePendingForMatch,
  hasHighlightVideoRendering,
  isHighlightGenerationComplete,
  writeHighlightGeneratePending,
} from '../../Utils/highlight-generate-pending.util';

interface ManualStatDraft {
  key: string;
  userId?: string | null;
  steamId?: string | null;
  playerName: string;
  teamId: string;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  hsPercent: number | null;
  damage: number | null;
  isCustom?: boolean;
}

@Component({
  selector: 'app-match-details',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, DemoUploadModalComponent, DemoStatusLoaderComponent, MatchMapVetoComponent, SeriesMapVetoComponent],
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
  showManualStatsForm = false;
  manualStatDrafts: ManualStatDraft[] = [];
  manualTotalRounds: number | null = null;
  manualStatsSaving = false;
  cs2Maps = CS2_MAPS;
  getMapLabel = getMapLabel;
  getHighlightTypeLabel = getHighlightTypeLabel;
  getHighlightRenderLabel = getHighlightRenderLabel;
  getHighlightTypeAccent = getHighlightTypeAccent;
  getHighlightRenderBadgeClass = getHighlightRenderBadgeClass;
  imageUploading = false;
  imageCaption = '';
  generatingHighlights = false;
  deletingHighlightId = '';
  deletingAllHighlights = false;
  pollingHighlights = false;
  highlightProgressPercent = 0;
  highlightProgressMessage = '';
  highlightProgressError = '';
  myCaptainTeamIds: string[] = [];
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
        this.resumeHighlightPolling(demo);
      },
      error: () => {
        this.errorMsg = 'Demo não encontrada.';
        this.loading = false;
      }
    });
  }

  startDemoStatusPolling(id: string): void {
    this.pollSub?.unsubscribe();
    this.pollingDemo = true;
    this.pollSub = interval(3000).pipe(
      startWith(0),
      switchMap(() => this.demoService.getDemo(id)),
      takeWhile((demo) => demo.status === 'pending' || demo.status === 'processing', true)
    ).subscribe({
      next: (demo) => {
        this.demo = demo;
        if (demo.status === 'completed') {
          this.stats = demo.stats || [];
          this.pollingDemo = false;
          this.resumeHighlightPolling(demo);
        }
        if (demo.status === 'failed') {
          this.pollingDemo = false;
        }
      },
    });
  }

  /** @deprecated use startDemoStatusPolling or startHighlightGenerationPolling */
  startDemoViewPolling(id: string): void {
    if (this.demo?.status === 'pending' || this.demo?.status === 'processing') {
      this.startDemoStatusPolling(id);
      return;
    }
    this.startHighlightGenerationPolling(id);
  }

  get isPollingDemoStats(): boolean {
    return this.pollingDemo && !!this.demo && (this.demo.status === 'pending' || this.demo.status === 'processing');
  }

  reprocessDemo(): void {
    if (!this.demo) return;
    this.demoService.reprocessDemo(this.demo.id).subscribe({
      next: (updated) => {
        this.demo = updated;
        this.startDemoStatusPolling(updated.id);
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
        this.myCaptainTeamIds = match.permissions?.captainTeamIds ?? [];
        this.stats = match.aggregatedStats || this.buildAggregatedStats(match.demos || []);
        this.loading = false;
        this.startPollingPendingDemos();
        this.resumeHighlightPolling(undefined, match);
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

  get showSeriesVeto(): boolean {
    return showSeriesVetoPanel(this.match?.series?.series ?? null);
  }

  get isBo3Match(): boolean {
    return checkIsBo3Match({
      seriesFormat: this.match?.series?.series?.format,
      leagueSeriesFormat: this.match?.league?.seriesFormat,
    });
  }

  get showSeriesPanel(): boolean {
    return this.isBo3Match;
  }

  get seriesMapWins(): string {
    const s = this.match?.series?.series;
    if (!s || !this.match) return '';
    return formatSeriesMapWins(s.team1MapWins, s.team2MapWins);
  }

  get seriesGames(): { id: string; seriesGameNumber: number | null; map: string | null; status: string }[] {
    return this.match?.series?.matches ?? [];
  }

  isCurrentSeriesGame(gameId: string): boolean {
    return this.match?.id === gameId;
  }

  get showMatchVeto(): boolean {
    return showMatchMapVeto({
      mapVetoEnabled: this.match?.mapVetoEnabled,
      isBo3: this.isBo3Match,
      seriesVetoStatus: this.match?.series?.series?.vetoStatus,
      hasMapVeto: !!this.match?.mapVeto,
    });
  }

  get canEditManualStats(): boolean {
    return !!this.match?.permissions?.canEditManualStats && !this.match?.hasFileDemo;
  }

  get matchTotalRounds(): number | null {
    if (!this.match) return null;
    const r1 = this.match.team1Rounds;
    const r2 = this.match.team2Rounds;
    if (r1 == null || r2 == null) return null;
    return r1 + r2;
  }

  get manualStatsTotalRounds(): number | null {
    return this.matchTotalRounds ?? this.manualTotalRounds;
  }

  get canSaveManualStats(): boolean {
    if (!this.canEditManualStats || this.manualStatsSaving) return false;
    if (!this.manualStatsTotalRounds || this.manualStatsTotalRounds <= 0) return false;
    return this.manualStatDrafts.some((row) => this.hasManualRowData(row));
  }

  openManualStatsForm(): void {
    if (!this.match) return;
    this.initManualStatsForm();
    this.showManualStatsForm = true;
  }

  closeManualStatsForm(): void {
    if (this.manualStatsSaving) return;
    this.showManualStatsForm = false;
  }

  initManualStatsForm(): void {
    if (!this.match?.roster) {
      this.manualStatDrafts = [];
      return;
    }

    const existingStats = this.getManualDemoStats();
    const byKey = new Map<string, MatchPlayerStat>();
    for (const stat of existingStats) {
      const key = `${stat.teamId || ''}:${stat.steamId || stat.playerName.toLowerCase()}`;
      byKey.set(key, stat);
    }

    const buildRows = (players: MatchRosterPlayer[]) =>
      players.map((player) => {
        const key = `${player.teamId}:${player.steamId || player.playerName.toLowerCase()}`;
        const existing = byKey.get(key);
        return {
          key,
          userId: player.userId,
          steamId: player.steamId,
          playerName: player.playerName,
          teamId: player.teamId,
          kills: existing?.kills ?? null,
          deaths: existing?.deaths ?? null,
          assists: existing?.assists ?? null,
          hsPercent: existing?.hsPercent ?? null,
          damage: existing?.damage ?? null,
        } satisfies ManualStatDraft;
      });

    const rosterRows = [
      ...buildRows(this.match.roster.team1),
      ...buildRows(this.match.roster.team2),
    ];
    const rosterKeys = new Set(rosterRows.map((row) => row.key));

    const customRows = existingStats
      .filter((stat) => {
        const key = `${stat.teamId || ''}:${stat.steamId || stat.playerName.toLowerCase()}`;
        return !rosterKeys.has(key);
      })
      .map((stat) => ({
        key: `custom:${stat.id}`,
        userId: null,
        steamId: stat.steamId,
        playerName: stat.playerName,
        teamId: stat.teamId || this.match!.team1.id,
        kills: stat.kills,
        deaths: stat.deaths,
        assists: stat.assists ?? null,
        hsPercent: stat.hsPercent,
        damage: stat.damage ?? null,
        isCustom: true,
      }));

    this.manualStatDrafts = [...rosterRows, ...customRows];
    this.manualTotalRounds = this.matchTotalRounds;
  }

  getManualDemoStats(): MatchPlayerStat[] {
    const manualDemo = this.match?.demos?.find((demo) => demo.isManual && demo.status === 'completed');
    return manualDemo?.stats || [];
  }

  teamManualDrafts(teamId: string): ManualStatDraft[] {
    return this.manualStatDrafts.filter((row) => row.teamId === teamId);
  }

  addCustomPlayer(teamId: string): void {
    const key = `new:${teamId}:${Date.now()}`;
    this.manualStatDrafts = [
      ...this.manualStatDrafts,
      {
        key,
        userId: null,
        steamId: null,
        playerName: '',
        teamId,
        kills: null,
        deaths: null,
        assists: null,
        hsPercent: null,
        damage: null,
        isCustom: true,
      },
    ];
  }

  removeCustomPlayer(key: string): void {
    this.manualStatDrafts = this.manualStatDrafts.filter((row) => row.key !== key);
  }

  hasManualRowData(row: ManualStatDraft): boolean {
    return [row.kills, row.deaths, row.assists, row.damage].some((value) => Number(value) > 0);
  }

  calcManualAdr(row: ManualStatDraft): string {
    const damage = Number(row.damage);
    const rounds = this.manualStatsTotalRounds;
    if (!rounds || rounds <= 0 || !Number.isFinite(damage) || damage <= 0) return '—';
    return (Math.round((damage / rounds) * 10) / 10).toFixed(1);
  }

  saveManualStats(): void {
    if (!this.matchId || !this.canSaveManualStats) return;

    const players: ManualPlayerStatInput[] = this.manualStatDrafts
      .filter((row) => this.hasManualRowData(row) && row.playerName.trim())
      .map((row) => ({
        userId: row.userId,
        steamId: row.steamId,
        playerName: row.playerName.trim(),
        teamId: row.teamId,
        kills: Number(row.kills) || 0,
        deaths: Number(row.deaths) || 0,
        assists: Number(row.assists) || 0,
        hsPercent: Number(row.hsPercent) || 0,
        damage: Number(row.damage) || 0,
      }));

    this.manualStatsSaving = true;
    this.matchService
      .saveManualStats(this.matchId, players, this.matchTotalRounds ? null : this.manualTotalRounds)
      .subscribe({
        next: (match) => {
          this.match = match;
          this.stats = match.aggregatedStats || this.buildAggregatedStats(match.demos || []);
          this.manualStatsSaving = false;
          this.showManualStatsForm = false;
          this.notify.success('Estatísticas manuais salvas com sucesso.');
        },
        error: (err) => {
          this.manualStatsSaving = false;
          this.notify.error(err.error?.error || 'Erro ao salvar estatísticas manuais');
        },
      });
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

  onVetoUpdated(): void {
    if (this.matchId) this.loadMatch(this.matchId);
  }

  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !this.match) return;
    this.imageUploading = true;
    this.matchService.uploadMatchImage(this.match.id, file, this.imageCaption.trim() || undefined).subscribe({
      next: (image) => {
        this.match!.images = [image, ...(this.match!.images ?? [])];
        this.imageUploading = false;
        this.imageCaption = '';
        input.value = '';
        this.notify.success('Imagem anexada à partida.');
      },
      error: (err) => {
        this.imageUploading = false;
        this.notify.error(err.error?.error || 'Erro ao enviar imagem.');
      },
    });
  }

  deleteImage(imageId: string): void {
    if (!this.match) return;
    this.matchService.deleteMatchImage(this.match.id, imageId).subscribe({
      next: () => {
        this.match!.images = (this.match!.images ?? []).filter((i) => i.id !== imageId);
        this.notify.success('Imagem removida.');
      },
      error: () => this.notify.error('Erro ao remover imagem.'),
    });
  }

  canDownloadHighlightVideo(highlight: MatchHighlight): boolean {
    return highlight.clipRenderStatus === 'COMPLETED' && !!highlight.clipVideoUrl;
  }

  isHighlightVideoRendering(highlight: MatchHighlight): boolean {
    return highlight.clipRenderStatus === 'PENDING' || highlight.clipRenderStatus === 'PROCESSING';
  }

  downloadHighlightClip(highlightId: string): void {
    if (!this.match) return;
    this.matchService.downloadHighlightClip(this.match.id, highlightId).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `highlight-${highlightId.slice(0, 8)}.vdm.txt`;
        a.click();
        URL.revokeObjectURL(url);
        this.notify.success('Spec de clipe baixada.');
      },
      error: (err) => {
        this.notify.error(err.error?.error || 'Erro ao baixar spec do clipe.');
      },
    });
  }

  downloadHighlightVideo(highlightId: string): void {
    if (this.isDemoView && this.demo) {
      this.demoService.downloadDemoHighlightVideo(this.demo.id, highlightId).subscribe({
        next: (blob) => this.saveHighlightBlob(blob, highlightId, 'mp4', 'Vídeo MP4 baixado.'),
        error: (err) => this.notify.error(err.error?.error || 'Erro ao baixar vídeo do destaque.'),
      });
      return;
    }
    if (!this.match) return;
    this.matchService.downloadHighlightVideo(this.match.id, highlightId).subscribe({
      next: (blob) => this.saveHighlightBlob(blob, highlightId, 'mp4', 'Vídeo MP4 baixado.'),
      error: (err) => this.notify.error(err.error?.error || 'Erro ao baixar vídeo do destaque.'),
    });
  }

  downloadDemoHighlightClip(highlightId: string): void {
    if (!this.demo) return;
    this.demoService.downloadDemoHighlightClip(this.demo.id, highlightId).subscribe({
      next: (blob) => this.saveHighlightBlob(blob, highlightId, 'vdm.txt', 'Spec de clipe baixada.'),
      error: (err) => this.notify.error(err.error?.error || 'Erro ao baixar spec do clipe.'),
    });
  }

  deleteHighlight(highlightId: string): void {
    const highlight = this.visibleHighlights.find((h) => h.id === highlightId);
    const label = highlight
      ? `${highlight.playerName} · Round ${highlight.round}`
      : 'este destaque';
    if (!confirm(`Excluir o destaque "${label}"?`)) return;

    this.deletingHighlightId = highlightId;
    const onSuccess = () => {
      this.deletingHighlightId = '';
      this.removeHighlightFromView(highlightId);
      this.notify.success('Destaque excluído.');
    };
    const onError = (err: { error?: { error?: string } }) => {
      this.deletingHighlightId = '';
      this.notify.error(err.error?.error || 'Erro ao excluir destaque.');
    };

    if (this.isDemoView && this.demo) {
      this.demoService.deleteDemoHighlight(this.demo.id, highlightId).subscribe({
        next: onSuccess,
        error: onError,
      });
      return;
    }
    if (!this.match) return;
    this.matchService.deleteMatchHighlight(this.match.id, highlightId).subscribe({
      next: onSuccess,
      error: onError,
    });
  }

  deleteAllHighlights(): void {
    const count = this.visibleHighlights.length;
    if (!count || !this.canDeleteHighlights) return;
    if (!confirm(`Excluir todos os ${count} destaque(s)?`)) return;

    this.deletingAllHighlights = true;
    const onSuccess = (deleted: number) => {
      this.deletingAllHighlights = false;
      this.clearHighlightsFromView();
      this.notify.success(`${deleted} destaque(s) excluído(s).`);
    };
    const onError = (err: { error?: { error?: string } }) => {
      this.deletingAllHighlights = false;
      this.notify.error(err.error?.error || 'Erro ao excluir destaques.');
    };

    if (this.isDemoView && this.demo) {
      this.demoService.deleteAllDemoHighlights(this.demo.id).subscribe({
        next: (res) => onSuccess(res.deleted),
        error: onError,
      });
      return;
    }
    if (!this.match) return;
    this.matchService.deleteAllMatchHighlights(this.match.id).subscribe({
      next: (res) => onSuccess(res.deleted),
      error: onError,
    });
  }

  private removeHighlightFromView(highlightId: string): void {
    if (this.isDemoView && this.demo?.highlights) {
      this.demo = {
        ...this.demo,
        highlights: this.demo.highlights.filter((h) => h.id !== highlightId),
      };
      return;
    }
    if (this.match?.highlights) {
      this.match = {
        ...this.match,
        highlights: this.match.highlights.filter((h) => h.id !== highlightId),
      };
    }
  }

  private clearHighlightsFromView(): void {
    if (this.isDemoView && this.demo) {
      this.demo = { ...this.demo, highlights: [] };
      return;
    }
    if (this.match) {
      this.match = { ...this.match, highlights: [] };
    }
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

  get canReprocessDemo(): boolean {
    if (!this.demo) return false;
    const userId = this.authService.currentUser?.id;
    if (!userId) return false;
    return this.demo.uploadedById === userId || this.authService.isSystemAdmin();
  }

  get visibleHighlights(): MatchHighlight[] {
    if (this.isDemoView && this.demo?.highlights?.length) {
      return this.demo.highlights;
    }
    return this.match?.highlights ?? [];
  }

  get canShowHighlightsSection(): boolean {
    if (this.isDemoView) {
      return !!this.demo && this.demo.status === 'completed' && !this.demo.isManual;
    }
    return (this.match?.demos ?? []).some((demo) => demo.status === 'completed' && !demo.isManual);
  }

  get canGenerateHighlights(): boolean {
    return this.canShowHighlightsSection && !this.generatingHighlights;
  }

  get canDeleteHighlights(): boolean {
    if (!this.authService.currentUser) return false;
    if (this.isDemoView) return this.canReprocessDemo;
    if (this.authService.isSystemAdmin()) return true;
    if (this.match?.league?.ownerId && this.authService.isLeagueOwner(this.match.league.ownerId)) {
      return true;
    }
    const userId = this.authService.currentUser.id;
    return (this.match?.demos ?? []).some((demo) => demo.uploadedById === userId);
  }

  get generateHighlightsLabel(): string {
    return this.visibleHighlights.length ? 'Regenerar destaques' : 'Gerar destaques';
  }

  private markHighlightGeneratePending(): void {
    const snapshot = createHighlightSnapshot(this.visibleHighlights);
    writeHighlightGeneratePending({
      demoId: this.isDemoView ? this.demo?.id : undefined,
      matchId: !this.isDemoView ? this.match?.id : undefined,
      startedAt: Date.now(),
      ...snapshot,
    });
    this.generatingHighlights = true;
  }

  private resumeHighlightPolling(demo?: Demo, match?: Match): void {
    const demoId = demo?.id;
    const matchId = match?.id;
    const pending =
      (demoId && findHighlightGeneratePendingForDemo(demoId)) ||
      (matchId && findHighlightGeneratePendingForMatch(matchId)) ||
      null;

    if (pending) {
      const highlights = demo?.highlights ?? match?.highlights ?? [];
      this.generatingHighlights = !isHighlightGenerationComplete(highlights, pending);
      if (!this.generatingHighlights) {
        clearHighlightGeneratePending();
      }
    }

    if (demo && (demo.status === 'pending' || demo.status === 'processing')) {
      this.startDemoStatusPolling(demo.id);
      return;
    }

    if (this.shouldContinueHighlightPolling(demo, match)) {
      this.startHighlightGenerationPolling(demoId, matchId);
    }
  }

  private applyHighlightProgress(progress: { percent?: number; phase?: string; message?: string; error?: string }): void {
    if (!progress || progress.phase === 'idle') {
      return;
    }
    this.highlightProgressPercent = progress.percent ?? 0;
    this.highlightProgressMessage = progress.message ?? '';
    this.highlightProgressError = progress.error ?? '';
    if (progress.phase === 'completed') {
      this.generatingHighlights = false;
      clearHighlightGeneratePending();
    }
    if (progress.phase === 'failed') {
      this.generatingHighlights = false;
      this.pollingHighlights = false;
      clearHighlightGeneratePending();
      if (progress.error || progress.message) {
        this.notify.error(progress.error || progress.message || 'Falha ao gerar destaques.');
      }
    }
  }

  private updateHighlightPollingFlags(): void {
    const highlights = this.isDemoView
      ? (this.demo?.highlights ?? [])
      : (this.match?.highlights ?? []);
    const rendering = hasHighlightVideoRendering(highlights);
    const inProgress = this.generatingHighlights && this.highlightProgressPercent < 100;
    this.pollingHighlights = rendering || inProgress;
    if (!this.pollingHighlights && !rendering) {
      this.generatingHighlights = false;
    }
  }

  private startHighlightGenerationPolling(demoId?: string, matchId?: string): void {
    this.pollSub?.unsubscribe();
    this.pollingHighlights = true;

    if (this.isDemoView && demoId) {
      this.pollSub = interval(2000)
        .pipe(
          startWith(0),
          switchMap(() =>
            forkJoin({
              demo: this.demoService.getDemo(demoId),
              progress: this.demoService.getHighlightProgress(demoId),
            })
          ),
          takeWhile(() => this.shouldContinueHighlightPolling(), true)
        )
        .subscribe({
          next: ({ demo, progress }) => {
            if (demo.status === 'completed' && this.demo) {
              this.demo = { ...this.demo, highlights: demo.highlights };
            } else {
              this.demo = demo;
              if (demo.status === 'completed') {
                this.stats = demo.stats || [];
              }
            }
            this.applyHighlightProgress(progress);
            this.syncHighlightGenerationFromPoll(demo.highlights ?? [], demoId);
            this.updateHighlightPollingFlags();
          },
          complete: () => {
            this.pollingHighlights = false;
            this.generatingHighlights = false;
          },
        });
      return;
    }

    if (matchId) {
      this.pollSub = interval(2000)
        .pipe(
          startWith(0),
          switchMap(() =>
            forkJoin({
              match: this.matchService.getMatch(matchId),
              progress: this.matchService.getHighlightProgress(matchId),
            })
          ),
          takeWhile(() => this.shouldContinueHighlightPolling(), true)
        )
        .subscribe({
          next: ({ match, progress }) => {
            this.match = match;
            this.applyHighlightProgress(progress);
            this.syncHighlightGenerationFromPoll(match.highlights ?? [], undefined, matchId);
            this.updateHighlightPollingFlags();
          },
          complete: () => {
            this.pollingHighlights = false;
            this.generatingHighlights = false;
          },
        });
      return;
    }

    this.pollingHighlights = false;
  }

  private syncHighlightGenerationFromPoll(
    highlights: MatchHighlight[],
    demoId?: string,
    matchId?: string
  ): void {
    const pending =
      (demoId && findHighlightGeneratePendingForDemo(demoId)) ||
      (matchId && findHighlightGeneratePendingForMatch(matchId)) ||
      null;
    if (!pending) {
      return;
    }

    if (isHighlightGenerationComplete(highlights, pending) && !hasHighlightVideoRendering(highlights)) {
      clearHighlightGeneratePending();
      this.generatingHighlights = false;
    }
  }

  private shouldContinueHighlightPolling(demo?: Demo, match?: Match): boolean {
    const currentDemo = demo ?? this.demo ?? undefined;
    const currentMatch = match ?? this.match ?? undefined;
    const highlights = currentDemo?.highlights ?? currentMatch?.highlights ?? [];

    if (hasHighlightVideoRendering(highlights)) {
      return true;
    }

    if (this.generatingHighlights && this.highlightProgressPercent < 100) {
      return true;
    }

    const pending =
      (currentDemo?.id && findHighlightGeneratePendingForDemo(currentDemo.id)) ||
      (currentMatch?.id && findHighlightGeneratePendingForMatch(currentMatch.id)) ||
      null;

    if (pending) {
      if (isHighlightGenerationComplete(highlights, pending) && !hasHighlightVideoRendering(highlights)) {
        clearHighlightGeneratePending();
        this.generatingHighlights = false;
        return false;
      }
      this.generatingHighlights = true;
      return true;
    }

    return false;
  }

  generateHighlights(): void {
    if (!this.canGenerateHighlights) return;

    this.markHighlightGeneratePending();
    this.highlightProgressPercent = 0;
    this.highlightProgressMessage = 'Na fila de extração de destaques...';
    this.highlightProgressError = '';
    const request$ = this.isDemoView && this.demo
      ? this.demoService.generateHighlights(this.demo.id)
      : this.match
        ? this.matchService.generateHighlights(this.match.id)
        : null;

    if (!request$) {
      this.generatingHighlights = false;
      clearHighlightGeneratePending();
      return;
    }

    request$.subscribe({
      next: (res) => {
        this.notify.success(res.message || 'Geração de destaques enfileirada.');
        if (this.isDemoView && this.demo) {
          this.startHighlightGenerationPolling(this.demo.id);
        } else if (this.matchId) {
          this.startHighlightGenerationPolling(undefined, this.matchId);
        }
      },
      error: (err) => {
        this.generatingHighlights = false;
        clearHighlightGeneratePending();
        this.notify.error(err.error?.error || 'Erro ao gerar destaques.');
      },
    });
  }
}
