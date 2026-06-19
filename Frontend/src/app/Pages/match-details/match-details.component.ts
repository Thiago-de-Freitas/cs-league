import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { MatchService } from '../../Services/match.service';
import { DemoService } from '../../Services/demo.service';
import { Match, MatchPlayerStat } from '../../Models/interfaces';

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
  stats: MatchPlayerStat[] = [];
  loading = true;
  errorMsg = '';
  isDemoView = false;

  constructor(
    private route: ActivatedRoute,
    private matchService: MatchService,
    private demoService: DemoService
  ) {}

  ngOnInit(): void {
    this.matchId = this.route.snapshot.paramMap.get('id');
    if (this.matchId) {
      const isDemoRoute = this.route.snapshot.url.some((s) => s.path === 'demo');
      if (isDemoRoute) {
        this.loadDemo(this.matchId);
      } else {
        this.loadMatch(this.matchId);
      }
    }
  }

  loadDemo(id: string): void {
    this.loading = true;
    this.isDemoView = true;
    this.demoService.getDemo(id).subscribe({
      next: (demo) => {
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
    this.matchService.getMatch(id).subscribe({
      next: (match) => {
        this.match = match;
        this.loading = false;
        if (match.demos && match.demos.length > 0 && match.demos[0].stats) {
          this.stats = match.demos[0].stats!;
        }
      },
      error: () => {
        this.demoService.getDemo(id).subscribe({
          next: (demo) => {
            this.isDemoView = true;
            this.stats = demo.stats || [];
            this.loading = false;
          },
          error: () => {
            this.errorMsg = 'Partida ou demo não encontrada.';
            this.loading = false;
          }
        });
      }
    });
  }

  getKd(stat: MatchPlayerStat): string {
    return stat.deaths > 0 ? (stat.kills / stat.deaths).toFixed(2) : stat.kills.toString();
  }
}
