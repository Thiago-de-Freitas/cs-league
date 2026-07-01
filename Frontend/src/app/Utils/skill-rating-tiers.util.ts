export type SkillRatingTier = 'subpar' | 'average' | 'good' | 'excellent';

export const SKILL_RATING_GOAL = 50;

/** Mesma lógica do backend (playerAnalytics.tierFromRating). */
export function skillRatingTier(rating: number, goal = SKILL_RATING_GOAL): SkillRatingTier {
  if (rating >= goal + 15) return 'excellent';
  if (rating >= goal) return 'good';
  if (rating >= goal - 12) return 'average';
  return 'subpar';
}

export type SkillRatingTierInfo = {
  tier: SkillRatingTier;
  label: string;
  rankLabel: string;
  cssClass: string;
  min: number;
  max: number;
};

/** Faixas 0–100 alinhadas às cores de rank do CS2. */
export const SKILL_RATING_TIERS: SkillRatingTierInfo[] = [
  {
    tier: 'subpar',
    label: 'Abaixo da média',
    rankLabel: 'Prata / Gold Nova',
    cssClass: 'skill-tier-subpar',
    min: 0,
    max: 37,
  },
  {
    tier: 'average',
    label: 'Na média',
    rankLabel: 'MG / DMG',
    cssClass: 'skill-tier-average',
    min: 38,
    max: 49,
  },
  {
    tier: 'good',
    label: 'Acima da média',
    rankLabel: 'LE / LEM',
    cssClass: 'skill-tier-good',
    min: 50,
    max: 64,
  },
  {
    tier: 'excellent',
    label: 'Excelente',
    rankLabel: 'Supreme / Global',
    cssClass: 'skill-tier-excellent',
    min: 65,
    max: 100,
  },
];

export function skillRatingTierInfo(rating: number, goal = SKILL_RATING_GOAL): SkillRatingTierInfo {
  const tier = skillRatingTier(rating, goal);
  return SKILL_RATING_TIERS.find((entry) => entry.tier === tier) ?? SKILL_RATING_TIERS[0];
}
