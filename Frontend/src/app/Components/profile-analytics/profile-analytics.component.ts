import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { PersonalPerformanceAnalytics, RecentFormPoint } from '../../Models/interfaces';
import {
  buildSmoothAreaPath,
  buildSmoothLinePath,
  GROWTH_CHART_VIEW,
  GrowthChartCoord,
  mapValueToChartY,
} from '../../Utils/growth-chart.util';
import {
  SKILL_RATING_TIERS,
  skillRatingTierInfo,
} from '../../Utils/skill-rating-tiers.util';

type GrowthChartId = 'rating' | 'impact' | 'aim' | 'positioning' | 'utility';

interface GrowthChartConfig {
  id: GrowthChartId;
  label: string;
  colorClass: string;
  min: number;
  max: number;
  baseline: number;
  featured?: boolean;
  formatValue: (value: number) => string;
  pickValue: (point: RecentFormPoint) => number;
}

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
  readonly chartViewHeight = GROWTH_CHART_VIEW.height;

  readonly primaryGrowthCharts: GrowthChartConfig[] = [
    {
      id: 'rating',
      label: 'Rating',
      colorClass: 'form-chart-tone-orange',
      min: -4,
      max: 3,
      baseline: 0,
      featured: true,
      formatValue: (value) => this.formatRating(value),
      pickValue: (point) => point.performanceRating,
    },
    {
      id: 'impact',
      label: 'Impacto',
      colorClass: 'form-chart-tone-green',
      min: 0,
      max: 100,
      baseline: 50,
      featured: true,
      formatValue: (value) => `${Math.round(value)}%`,
      pickValue: (point) => point.winRateProxy,
    },
  ];

  readonly skillGrowthCharts: GrowthChartConfig[] = [
    {
      id: 'aim',
      label: 'Mira',
      colorClass: 'form-chart-tone-gold',
      min: 0,
      max: 100,
      baseline: 50,
      formatValue: (value) => `${Math.round(value)}`,
      pickValue: (point) => point.skills?.aim ?? 50,
    },
    {
      id: 'positioning',
      label: 'Posicionamento',
      colorClass: 'form-chart-tone-legendary',
      min: 0,
      max: 100,
      baseline: 50,
      formatValue: (value) => `${Math.round(value)}`,
      pickValue: (point) => point.skills?.positioning ?? 50,
    },
    {
      id: 'utility',
      label: 'Utilitários',
      colorClass: 'form-chart-tone-mg',
      min: 0,
      max: 100,
      baseline: 50,
      formatValue: (value) => `${Math.round(value)}`,
      pickValue: (point) => point.skills?.utility ?? 50,
    },
  ];

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

  chartCoords(chart: GrowthChartConfig): GrowthChartCoord[] {
    const form = this.analytics?.recentForm ?? [];
    if (form.length < 2) return [];

    const values = form.map((point) => chart.pickValue(point));
    const { width, padX } = GROWTH_CHART_VIEW;
    const step = (width - padX * 2) / (values.length - 1);

    return values.map((value, index) => ({
      x: padX + index * step,
      y: mapValueToChartY(value, chart.min, chart.max),
    }));
  }

  hasEnoughDemosForTrend(): boolean {
    return (this.analytics?.recentForm?.length ?? 0) >= 2;
  }

  chartGradientId(chart: GrowthChartConfig): string {
    return `growth-grad-${chart.id}`;
  }

  chartAreaFill(chart: GrowthChartConfig): string {
    return `url(#${this.chartGradientId(chart)})`;
  }

  chartSmoothLinePath(chart: GrowthChartConfig): string {
    return buildSmoothLinePath(this.chartCoords(chart));
  }

  chartSmoothAreaPath(chart: GrowthChartConfig): string {
    return buildSmoothAreaPath(this.chartCoords(chart), GROWTH_CHART_VIEW.height);
  }

  latestChartValue(chart: GrowthChartConfig): string | null {
    const points = this.analytics?.recentForm ?? [];
    if (points.length === 0) return null;
    const latest = points[points.length - 1];
    return chart.formatValue(chart.pickValue(latest));
  }

  latestChartValueClass(chart: GrowthChartConfig): string {
    if (chart.id === 'rating' || chart.id === 'impact') return '';
    const points = this.analytics?.recentForm ?? [];
    if (points.length === 0) return '';
    const latest = points[points.length - 1];
    return this.skillValueClass(chart.pickValue(latest));
  }

  formatRating(value: number): string {
    return value > 0 ? `+${value.toFixed(2)}` : value.toFixed(2);
  }
}
