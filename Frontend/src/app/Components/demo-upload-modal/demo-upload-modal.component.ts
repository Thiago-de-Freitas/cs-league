import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DemoService } from '../../Services/demo.service';
import { LeagueService } from '../../Services/league.service';
import { Demo, League, Match } from '../../Models/interfaces';

@Component({
  selector: 'app-demo-upload-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './demo-upload-modal.component.html',
  styleUrls: ['./demo-upload-modal.component.css']
})
export class DemoUploadModalComponent implements OnInit {
  @Input() prefillLeagueId = '';
  @Input() prefillMatchId = '';
  @Output() closed = new EventEmitter<void>();
  @Output() uploaded = new EventEmitter<Demo>();

  selectedFile: File | null = null;
  uploading = false;
  errorMsg = '';
  leagues: League[] = [];
  selectedLeagueId = '';
  selectedMatchId = '';
  matches: Match[] = [];

  constructor(
    private demoService: DemoService,
    private leagueService: LeagueService
  ) {}

  ngOnInit(): void {
    this.leagueService.getLeagues().subscribe({
      next: (leagues) => {
        this.leagues = leagues;
        if (this.prefillLeagueId) {
          this.selectedLeagueId = this.prefillLeagueId;
          this.onLeagueChange(this.prefillMatchId);
        }
      }
    });
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('gc-modal-backdrop')) {
      this.close();
    }
  }

  close(): void {
    if (!this.uploading) {
      this.closed.emit();
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.selectedFile = input.files[0];
      this.errorMsg = '';
    }
  }

  onLeagueChange(preselectMatchId?: string): void {
    if (!this.selectedLeagueId) {
      this.matches = [];
      this.selectedMatchId = '';
      return;
    }
    this.leagueService.getLeagueById(this.selectedLeagueId).subscribe({
      next: (league) => {
        this.matches = league.matches || [];
        this.selectedMatchId = preselectMatchId || '';
      }
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
        this.uploaded.emit(demo);
      },
      error: (err) => {
        this.uploading = false;
        this.errorMsg = err.error?.error || 'Erro no upload.';
      }
    });
  }
}
