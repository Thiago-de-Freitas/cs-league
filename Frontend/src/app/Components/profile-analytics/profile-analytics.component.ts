import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { PersonalPerformanceAnalytics } from '../../Models/interfaces';
import {
  SKILL_RATING_TIERS,
  skillRatingTierInfo,
} from '../../Utils/skill-rating-tiers.util';

@Component({
  selector: 'app-profile-analytics',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './profile-analytics.component.html',
  styleUrls: ['./profile-analytics.component.css'],
})
export class ProfileAnalyticsSectionComponent {
  @Input() analytics: PersonalPerformanceAnalytics | null = null;

  readonly skillRatingTiers = SKILL_RATING_TIERS;

  formTab: 'rating' | 'winrate' = 'rating';

  tierClass(tier: string): string {
    switch (tier) {
      case 'excellent':
        return 'insight-tier-excellent';
      case 'good':
        return 'insight-tier-good';
      case 'average':
        return 'insight-tier-average';
      default:
        return 'insight-tier-subpar';
    }
  }

  tierLabel(tier: string): string {
    switch (tier) {
      case 'excellent':
        return 'Excelente';
      case 'good':
        return 'Acima da média';
      case 'average':
        return 'Na média';
      default:
        return 'Abaixo da média';
    }
  }

  skillValueClass(rating: number): string {
    return skillRatingTierInfo(rating).cssClass;
  }

  skillRankLabel(rating: number): string {
    return skillRatingTierInfo(rating).rankLabel;
  }

  performanceGaugePercent(): number {
    const rating = this.analytics?.performanceRating ?? 0;
    return Math.round(((rating + 4) / 7) * 100);
  }

  sideGaugePercent(value: number): number {
    return Math.round(((value + 4) / 7) * 100);
  }

  radarPoint(axis: 'aim' | 'positioning' | 'utility', scale: 'you' | 'goal'): string {
    const skills = scale === 'you' ? this.analytics?.skills : this.analytics?.skillsGoal;
    if (!skills) return '50,50';
    const value = skills[axis] / 100;
    const center = 50;
    const radius = 38;
    const angles: Record<typeof axis, number> = {
      aim: -90,
      positioning: 30,
      utility: 150,
    };
    const rad = (angles[axis] * Math.PI) / 180;
    const x = center + Math.cos(rad) * radius * value;
    const y = center + Math.sin(rad) * radius * value;
    return `${x},${y}`;
  }

  radarPolygon(scale: 'you' | 'goal'): string {
    return ['aim', 'positioning', 'utility']
      .map((axis) => this.radarPoint(axis as 'aim' | 'positioning' | 'utility', scale))
      .join(' ');
  }

  setFormTab(tab: 'rating' | 'winrate'): void {
    this.formTab = tab;
  }

  chartPoints(): string {
    const points = this.analytics?.recentForm ?? [];
    if (points.length === 0) return '';
    const values = points.map((p) => (this.formTab === 'rating' ? p.performanceRating : (p.winRateProxy - 50) / 12.5));
    const min = -4;
    const max = 3;
    const width = 100;
    const height = 60;
    const step = points.length > 1 ? width / (points.length - 1) : 0;

    return values
      .map((value, index) => {
        const x = points.length > 1 ? index * step : width / 2;
        const clamped = Math.max(min, Math.min(max, value));
        const y = height - ((clamped - min) / (max - min)) * height;
        return `${x},${y}`;
      })
      .join(' ');
  }

  chartAreaPoints(): string {
    const line = this.chartPoints();
    if (!line) return '';
    const points = this.analytics?.recentForm ?? [];
    const width = 100;
    const height = 60;
    const lastX = points.length > 1 ? width : width / 2;
    return `0,${height} ${line} ${lastX},${height}`;
  }

  formatRating(value: number): string {
    return value > 0 ? `+${value.toFixed(2)}` : value.toFixed(2);
  }
}
