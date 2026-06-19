import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatchService } from '../../Services/match.service';
import { DemoService } from '../../Services/demo.service';
import { Demo, Match, MatchPlayerStat } from '../../Models/interfaces';

@Component({
  selector: 'app-match-details',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './match-details.component.html',
  styleUrls: ['./match-details.component.css']
})
export class MatchDetailsComponent implements OnInit {
  matchId: string | null = null;
  match: Match | null = null;
  demo: Demo | null = null;
  stats: MatchPlayerStat[] = [];
  loading = true;
  errorMsg = '';
  isDemoView = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private matchService: MatchService,
    private demoService: DemoService
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

  loadDemo(id: string): void {
    this.loading = true;
    this.isDemoView = true;
    this.demoService.getDemo(id).subscribe({
      next: (demo) => {
        this.demo = demo;
        this.stats = demo.stats || [];
        this.loading = false;
      },
      error: () => {
        this.errorMsg = 'Demo não encontrada.';
        this.loading = false;
      }
    });
  }

  loadMatch(id: string): void {
    this.loading = true;
    this.isDemoView = false;
    this.matchService.getMatch(id).subscribe({
      next: (match) => {
        this.match = match;
        this.loading = false;
      },
      error: () => {
        this.errorMsg = 'Partida não encontrada.';
        this.loading = false;
      }
    });
  }

  loadDemoStats(demo: Demo): void {
    this.stats = demo.stats || [];
    if (demo.status === 'completed' && demo.stats?.length) return;
    if (demo.status === 'pending' || demo.status === 'processing') {
      this.demoService.pollDemoStatus(demo.id).subscribe({
        next: (updated) => {
          if (this.match?.demos) {
            const idx = this.match.demos.findIndex((d) => d.id === updated.id);
            if (idx >= 0) this.match.demos[idx] = updated;
          }
          if (updated.stats?.length) this.stats = updated.stats;
        }
      });
    }
  }

  viewDemoStats(demo: Demo): void {
    this.stats = demo.stats || [];
    this.demo = demo;
  }

  getKd(stat: MatchPlayerStat): string {
    return stat.deaths > 0 ? (stat.kills / stat.deaths).toFixed(2) : stat.kills.toString();
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

  getRoundLabel(round?: number): string {
    if (!round || !this.match?.league) return '';
    const max = (this.match as Match & { league?: { maxTeams?: number } }).league;
    const total = Math.log2(max?.maxTeams || 8);
    const remaining = total - round + 1;
    if (remaining === 1) return 'Final';
    if (remaining === 2) return 'Semifinal';
    if (remaining === 3) return 'Quartas';
    return `Rodada ${round}`;
  }

  goToUpload(): void {
    if (!this.match) return;
    this.router.navigate(['/demo-upload'], {
      queryParams: { leagueId: this.match.leagueId, matchId: this.match.id }
    });
  }
}
