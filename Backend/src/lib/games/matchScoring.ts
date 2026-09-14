import type { GameTitle } from '@prisma/client';
import { getGameConfig } from './index';
import type { LeagueTeamStatDelta, MatchOutcome, ParsedMatchRounds } from '../matchResult';
import {
  getRoundsOnlyStatDeltas,
  getStatDeltasForTeams,
  parseMatchRounds,
  resolveMatchOutcome,
} from '../matchResult';

export { type LeagueTeamStatDelta, type MatchOutcome, type ParsedMatchRounds } from '../matchResult';

/** Pontos por colocação em partidas PUBG (padrão competitivo simplificado). */
export const PUBG_PLACEMENT_POINTS: Record<number, number> = {
  1: 15,
  2: 12,
  3: 10,
  4: 8,
  5: 6,
  6: 4,
  7: 2,
  8: 1,
};

export function pubgPointsForPlacement(placement: number): number {
  if (placement <= 0) return 0;
  if (placement in PUBG_PLACEMENT_POINTS) return PUBG_PLACEMENT_POINTS[placement] ?? 0;
  return 0;
}

export function parseMatchScoreForGame(
  game: GameTitle | string,
  team1Score: unknown,
  team2Score: unknown
): ParsedMatchRounds | { error: string } {
  const config = getGameConfig(game);
  if (config.scoringMode === 'PLACEMENT_POINTS') {
    return { error: 'Use o endpoint de resultado PUBG com colocação por time.' };
  }
  return parseMatchRounds(team1Score, team2Score);
}

export function resolveMatchOutcomeForGame(
  game: GameTitle | string,
  team1Id: string,
  team2Id: string,
  team1Score: number,
  team2Score: number,
  phase: string,
  winnerIdFromBody?: string | null
): MatchOutcome | { error: string } {
  const config = getGameConfig(game);
  if (config.scoringMode === 'PLACEMENT_POINTS') {
    return { error: 'Resultado por colocação não usa placar 1v1.' };
  }
  return resolveMatchOutcome(team1Id, team2Id, team1Score, team2Score, phase, winnerIdFromBody);
}

export function getStatDeltasForGame(
  game: GameTitle | string,
  team1Id: string,
  team2Id: string,
  team1Score: number,
  team2Score: number,
  outcome: MatchOutcome,
  roundsOnly = false
): Map<string, LeagueTeamStatDelta> {
  if (roundsOnly) {
    return getRoundsOnlyStatDeltas(team1Id, team2Id, team1Score, team2Score);
  }
  return getStatDeltasForTeams(team1Id, team2Id, team1Score, team2Score, outcome);
}

export interface PubgPlacementInput {
  teamId: string;
  placement: number;
}

export function parsePubgPlacements(
  placements: unknown
): PubgPlacementInput[] | { error: string } {
  if (!Array.isArray(placements) || placements.length === 0) {
    return { error: 'Informe a colocação de pelo menos um time.' };
  }
  const parsed: PubgPlacementInput[] = [];
  for (const item of placements) {
    if (!item || typeof item !== 'object') {
      return { error: 'Formato de colocação inválido.' };
    }
    const teamId = String((item as { teamId?: unknown }).teamId ?? '').trim();
    const placement = Number((item as { placement?: unknown }).placement);
    if (!teamId) return { error: 'teamId é obrigatório em cada colocação.' };
    if (!Number.isInteger(placement) || placement < 1 || placement > 100) {
      return { error: 'Colocação deve ser um inteiro entre 1 e 100.' };
    }
    parsed.push({ teamId, placement });
  }
  return parsed;
}

export function getPubgPlacementStatDeltas(
  placements: PubgPlacementInput[]
): Map<string, LeagueTeamStatDelta> {
  const deltas = new Map<string, LeagueTeamStatDelta>();
  for (const { teamId, placement } of placements) {
    const points = pubgPointsForPlacement(placement);
    deltas.set(teamId, {
      wins: placement === 1 ? 1 : 0,
      losses: 0,
      draws: 0,
      points,
      roundsWon: points,
      roundsLost: 0,
    });
  }
  return deltas;
}

export function usesRoundTiebreaker(game: GameTitle | string): boolean {
  return getGameConfig(game).scoringMode === 'ROUNDS';
}
