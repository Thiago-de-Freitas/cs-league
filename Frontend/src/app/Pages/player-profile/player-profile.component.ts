import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { RankingsService } from '../../Services/rankings.service';
import { PlayerProfileStats } from '../../Models/interfaces';

@Component({
  selector: 'app-player-profile',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './player-profile.component.html',
  styleUrls: ['./player-profile.component.css'],
})
export class PlayerProfileComponent implements OnInit {
  steamId = '';
  profile: PlayerProfileStats | null = null;
  loading = true;
  errorMsg = '';

  constructor(
    private route: ActivatedRoute,
    private rankingsService: RankingsService
  ) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const id = params.get('steamId');
      if (!id) {
        this.errorMsg = 'Jogador não informado.';
        this.loading = false;
        return;
      }
      this.steamId = id;
      this.loadProfile(id);
    });
  }

  loadProfile(steamId: string): void {
    this.loading = true;
    this.errorMsg = '';
    this.rankingsService.getPlayerProfile(steamId).subscribe({
      next: (profile) => {
        this.profile = profile;
        this.loading = false;
      },
      error: () => {
        this.errorMsg = 'Jogador não encontrado nas estatísticas de ligas.';
        this.loading = false;
      },
    });
  }

  getPlayerLabel(): string {
    if (!this.profile) return '';
    return this.profile.displayName || this.profile.playerName;
  }
}
