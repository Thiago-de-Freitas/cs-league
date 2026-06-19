import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { DemoService } from '../../Services/demo.service';
import { LeagueService } from '../../Services/league.service';
import { Demo, League, Match } from '../../Models/interfaces';
import { DemoUploadModalComponent } from '../../Components/demo-upload-modal/demo-upload-modal.component';

@Component({
  selector: 'app-demo-upload',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, DemoUploadModalComponent],
  templateUrl: './demo-upload.component.html',
  styleUrls: ['./demo-upload.component.css']
})
export class DemoUploadComponent implements OnInit {
  demos: Demo[] = [];
  leagues: League[] = [];
  loading = true;
  showUploadModal = false;
  uploadPrefillLeagueId = '';
  uploadPrefillMatchId = '';
  processingDemo: Demo | null = null;
  pollStatus = '';
  associatingDemoId: string | null = null;
  associateLeagueId = '';
  associateMatchId = '';
  associateMatches: Match[] = [];
  associating = false;
  errorMsg = '';

  constructor(
    private demoService: DemoService,
    private leagueService: LeagueService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.loadDemos();
    this.leagueService.getLeagues().subscribe({
      next: (leagues) => (this.leagues = leagues)
    });

    const params = this.route.snapshot.queryParams;
    if (params['leagueId']) {
      this.uploadPrefillLeagueId = params['leagueId'];
      this.uploadPrefillMatchId = params['matchId'] || '';
      this.showUploadModal = true;
    }
  }

  loadDemos(): void {
    this.loading = true;
    this.demoService.listDemos().subscribe({
      next: (demos) => {
        this.demos = demos;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
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
    this.startPolling(demo.id);
    this.loadDemos();
  }

  startPolling(demoId: string): void {
    this.demoService.pollDemoStatus(demoId).subscribe({
      next: (demo) => {
        this.pollStatus = demo.status;
        this.processingDemo = demo;
        if (demo.status === 'completed' || demo.status === 'failed') {
          this.loadDemos();
        }
      }
    });
  }

  viewDemo(demoId: string): void {
    this.router.navigate(['/demo', demoId]);
  }

  openAssociate(demo: Demo): void {
    this.associatingDemoId = demo.id;
    this.associateLeagueId = '';
    this.associateMatchId = '';
    this.associateMatches = [];
  }

  cancelAssociate(): void {
    this.associatingDemoId = null;
    this.associateLeagueId = '';
    this.associateMatchId = '';
    this.associateMatches = [];
  }

  onAssociateLeagueChange(): void {
    if (!this.associateLeagueId) {
      this.associateMatches = [];
      return;
    }
    this.leagueService.getLeagueById(this.associateLeagueId).subscribe({
      next: (league) => (this.associateMatches = league.matches || [])
    });
  }

  confirmAssociate(demo: Demo): void {
    if (!this.associateMatchId) {
      this.errorMsg = 'Selecione uma partida para associar';
      return;
    }
    this.associating = true;
    this.demoService.associateMatch(demo.id, this.associateMatchId).subscribe({
      next: () => {
        this.associating = false;
        this.errorMsg = '';
        this.cancelAssociate();
        this.loadDemos();
      },
      error: (err) => {
        this.associating = false;
        this.errorMsg = err.error?.error || 'Erro ao associar demo';
      }
    });
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
