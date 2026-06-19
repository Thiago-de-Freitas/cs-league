import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { DemoService } from '../../Services/demo.service';
import { LeagueService } from '../../Services/league.service';
import { AuthService } from '../../Services/auth.service';
import { Demo, League, Match } from '../../Models/interfaces';

type UploadMode = 'general' | 'personal';

@Component({
  selector: 'app-demo-upload-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './demo-upload-modal.component.html',
  styleUrls: ['./demo-upload-modal.component.css']
})
export class DemoUploadModalComponent implements OnInit {
  @Input() prefillLeagueId = '';
  @Input() prefillMatchId = '';
  @Output() closed = new EventEmitter<void>();
  @Output() uploaded = new EventEmitter<Demo>();

  uploadMode: UploadMode = 'general';
  selectedFile: File | null = null;
  uploading = false;
  errorMsg = '';
  matchValidationMsg = '';
  matchValidationOk = false;
  validatingMatch = false;
  leagues: League[] = [];
  selectedLeagueId = '';
  selectedMatchId = '';
  matches: Match[] = [];
  hasSteamId = false;
  existingDemoNames = new Set<string>();

  constructor(
    private demoService: DemoService,
    private leagueService: LeagueService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.authService.currentUser$.subscribe((user) => {
      this.hasSteamId = !!user?.steamId?.trim();
    });

    this.demoService.listDemos().subscribe({
      next: (demos) => {
        this.existingDemoNames = new Set(
          demos
            .filter((d) => d.status !== 'failed')
            .map((d) => d.fileName.toLowerCase())
        );
      }
    });

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

  get isPersonalMode(): boolean {
    return this.uploadMode === 'personal';
  }

  onModeChange(): void {
    this.errorMsg = '';
    this.matchValidationMsg = '';
    this.matchValidationOk = false;
    if (this.isPersonalMode && this.selectedMatchId) {
      this.validateSelectedMatch();
    }
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
      const file = input.files[0];
      this.selectedFile = file;
      this.errorMsg = '';
      if (this.existingDemoNames.has(file.name.toLowerCase())) {
        this.errorMsg = 'Este arquivo de demo já foi enviado.';
        this.selectedFile = null;
        input.value = '';
      }
    }
  }

  onLeagueChange(preselectMatchId?: string): void {
    this.matchValidationMsg = '';
    this.matchValidationOk = false;
    if (!this.selectedLeagueId) {
      this.matches = [];
      this.selectedMatchId = '';
      return;
    }
    this.leagueService.getLeagueById(this.selectedLeagueId).subscribe({
      next: (league) => {
        this.matches = league.matches || [];
        this.selectedMatchId = preselectMatchId || '';
        if (this.isPersonalMode && this.selectedMatchId) {
          this.validateSelectedMatch();
        }
      }
    });
  }

  onMatchChange(): void {
    this.matchValidationMsg = '';
    this.matchValidationOk = false;
    if (this.isPersonalMode && this.selectedMatchId) {
      this.validateSelectedMatch();
    }
  }

  validateSelectedMatch(): void {
    if (!this.selectedMatchId) return;
    this.validatingMatch = true;
    this.demoService.validatePersonalDemo(this.selectedMatchId).subscribe({
      next: (result) => {
        this.validatingMatch = false;
        if (result.valid) {
          this.matchValidationOk = true;
          this.matchValidationMsg = '';
        } else {
          this.matchValidationOk = false;
          this.matchValidationMsg = result.error || 'Não é possível enviar demo para esta partida.';
        }
      },
      error: () => {
        this.validatingMatch = false;
        this.matchValidationOk = false;
        this.matchValidationMsg = 'Erro ao validar a partida.';
      }
    });
  }

  upload(): void {
    if (!this.selectedFile) {
      this.errorMsg = 'Selecione um arquivo .dem';
      return;
    }

    if (this.isPersonalMode) {
      if (!this.hasSteamId) {
        this.errorMsg = 'Configure seu Steam ID no perfil antes de enviar uma demo pessoal.';
        return;
      }
      if (!this.selectedMatchId) {
        this.errorMsg = 'Selecione a partida para enviar a demo pessoal.';
        return;
      }
      if (!this.matchValidationOk) {
        this.errorMsg = this.matchValidationMsg || 'A partida selecionada não é válida para demo pessoal.';
        return;
      }
    }

    this.uploading = true;
    this.errorMsg = '';
    const matchId = this.selectedMatchId || undefined;

    this.demoService.uploadDemo(this.selectedFile, {
      matchId,
      isPersonal: this.isPersonalMode,
    }).subscribe({
      next: (demo) => {
        this.uploading = false;
        this.existingDemoNames.add(demo.fileName.toLowerCase());
        this.uploaded.emit(demo);
      },
      error: (err) => {
        this.uploading = false;
        this.errorMsg = err.error?.error || 'Erro no upload.';
      }
    });
  }
}
