import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { DemoService } from '../../Services/demo.service';
import { LeagueService } from '../../Services/league.service';
import { Demo, League, Match } from '../../Models/interfaces';

@Component({
  selector: 'app-demo-upload',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './demo-upload.component.html',
  styleUrls: ['./demo-upload.component.css']
})
export class DemoUploadComponent implements OnInit {
  selectedFile: File | null = null;
  uploading = false;
  errorMsg = '';
  demos: Demo[] = [];
  leagues: League[] = [];
  selectedMatchId = '';
  matches: Match[] = [];
  selectedLeagueId = '';
  processingDemo: Demo | null = null;
  pollStatus = '';

  constructor(
    private demoService: DemoService,
    private leagueService: LeagueService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadDemos();
    this.leagueService.getLeagues().subscribe({
      next: (leagues) => (this.leagues = leagues)
    });
  }

  loadDemos(): void {
    this.demoService.listDemos().subscribe({
      next: (demos) => (this.demos = demos)
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.selectedFile = input.files[0];
      this.errorMsg = '';
    }
  }

  onLeagueChange(): void {
    if (!this.selectedLeagueId) {
      this.matches = [];
      return;
    }
    this.leagueService.getLeagueById(this.selectedLeagueId).subscribe({
      next: (league) => (this.matches = league.matches || [])
    });
  }

  upload(): void {
    if (!this.selectedFile) {
      this.errorMsg = 'Selecione um arquivo .dem';
      return;
    }

    this.uploading = true;
    this.errorMsg = '';
    const matchId = this.selectedMatchId || undefined;

    this.demoService.uploadDemo(this.selectedFile, matchId).subscribe({
      next: (demo) => {
        this.uploading = false;
        this.selectedFile = null;
        this.processingDemo = demo;
        this.pollStatus = demo.status;
        this.startPolling(demo.id);
        this.loadDemos();
      },
      error: (err) => {
        this.uploading = false;
        this.errorMsg = err.error?.error || 'Erro no upload.';
      }
    });
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
