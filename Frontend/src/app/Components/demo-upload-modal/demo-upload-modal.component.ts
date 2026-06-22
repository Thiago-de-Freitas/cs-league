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
  @Input() allowedModes: UploadMode[] = ['general', 'personal'];
  @Output() closed = new EventEmitter<void>();
  @Output() uploaded = new EventEmitter<Demo>();

  uploadMode: UploadMode = 'general';
  selectedFile: File | null = null;
  uploading = false;
  uploadProgress = 0;
  queueUnavailable = false;
  queueUnavailableMsg = '';
  errorMsg = '';
  leagues: League[] = [];
  selectedLeagueId = '';
  selectedMatchId = '';
  matches: Match[] = [];
  hasSteamId = false;
  personalValidationOk = false;
  validatingPersonal = false;
  existingDemoNames = new Set<string>();

  constructor(
    private demoService: DemoService,
    private leagueService: LeagueService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.uploadMode = this.allowedModes[0] || 'general';

    this.authService.currentUser$.subscribe((user) => {
      this.hasSteamId = !!user?.steamId?.trim();
      if (this.isPersonalMode && this.hasSteamId) {
        this.validatePersonalProfile();
      }
    });

    const listDemos$ = this.isPersonalOnly
      ? this.demoService.listPersonalDemos()
      : this.demoService.listDemos();

    listDemos$.subscribe({
      next: (demos) => {
        this.existingDemoNames = new Set(
          demos
            .filter((d) => d.status !== 'failed')
            .map((d) => d.fileName.toLowerCase())
        );
      }
    });

    this.demoService.getDemoHealthConfig().subscribe({
      next: (config) => {
        const available = config.redis?.queueAvailable !== false && !(config.redisErrors?.length);
        if (!available) {
          this.queueUnavailable = true;
          this.queueUnavailableMsg =
            config.redisErrors?.[0] ||
            config.warnings?.[0] ||
            'Envio de demos temporariamente indisponível. Tente novamente mais tarde.';
        }
      },
    });

    if (!this.isPersonalMode) {
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
  }

  get isPersonalOnly(): boolean {
    return this.allowedModes.length === 1 && this.allowedModes[0] === 'personal';
  }

  get isGeneralOnly(): boolean {
    return this.allowedModes.length === 1 && this.allowedModes[0] === 'general';
  }

  get showModeSelector(): boolean {
    return this.allowedModes.length > 1;
  }

  get isPersonalMode(): boolean {
    return this.uploadMode === 'personal';
  }

  get showMatchAssociation(): boolean {
    return !this.isPersonalMode;
  }

  onModeChange(): void {
    this.errorMsg = '';
    if (this.isPersonalMode) {
      this.selectedLeagueId = '';
      this.selectedMatchId = '';
      this.matches = [];
      this.validatePersonalProfile();
    } else {
      this.personalValidationOk = false;
    }
  }

  validatePersonalProfile(): void {
    if (!this.hasSteamId) {
      this.personalValidationOk = false;
      return;
    }
    this.validatingPersonal = true;
    this.demoService.validatePersonalDemo().subscribe({
      next: (result) => {
        this.validatingPersonal = false;
        this.personalValidationOk = result.valid;
      },
      error: () => {
        this.validatingPersonal = false;
        this.personalValidationOk = false;
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
    if (!this.selectedLeagueId) {
      this.matches = [];
      this.selectedMatchId = '';
      return;
    }
    this.leagueService.getLeagueById(this.selectedLeagueId).subscribe({
      next: (league) => {
        this.matches = (league.matches || []).filter((m) => !m.hasGeneralDemo);
        this.selectedMatchId = preselectMatchId || '';
        if (this.selectedMatchId && !this.matches.some((m) => m.id === this.selectedMatchId)) {
          this.selectedMatchId = '';
        }
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
      if (!this.personalValidationOk) {
        this.errorMsg = 'Valide seu perfil antes de enviar a demo pessoal.';
        return;
      }
    } else if (!this.selectedMatchId) {
      this.errorMsg = 'Selecione uma partida para enviar a demo.';
      return;
    }

    this.uploading = true;
    this.uploadProgress = 0;
    this.errorMsg = '';
    const matchId = this.isPersonalMode ? undefined : this.selectedMatchId;

    this.demoService.uploadDemoWithProgress(this.selectedFile, {
      matchId,
      isPersonal: this.isPersonalMode,
    }).subscribe({
      next: (event) => {
        if (event.phase === 'uploading') {
          this.uploadProgress = event.progress;
          return;
        }
        if (event.demo) {
          this.uploading = false;
          this.uploadProgress = 100;
          this.existingDemoNames.add(event.demo.fileName.toLowerCase());
          this.uploaded.emit(event.demo);
        }
      },
      error: (err) => {
        this.uploading = false;
        this.uploadProgress = 0;
        this.errorMsg =
          err.error?.error ||
          (err.status === 503
            ? 'Serviço de análise indisponível. Verifique a configuração do Redis na Railway.'
            : 'Erro no upload.');
      }
    });
  }
}
