import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LeagueGroup, Match } from '../../Models/interfaces';
import { countRoundRobinMatches } from '../../Utils/group.util';

@Component({
  selector: 'app-league-groups',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './league-groups.component.html',
  styleUrls: ['./league-groups.component.css'],
})
export class LeagueGroupsComponent {
  @Input() groups: LeagueGroup[] = [];
  @Input() advancePerGroup = 2;
  @Input() singleGroup = false;
  @Input() canManage = false;
  @Input() canRegisterResult?: (match: Match) => boolean;
  @Output() matchClick = new EventEmitter<string>();
  @Output() registerResult = new EventEmitter<{ match: Match; winnerId: string }>();

  getMatchStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      scheduled: 'Agendada',
      in_progress: 'Em andamento',
      completed: 'Finalizada',
      cancelled: 'Cancelada',
    };
    return labels[status] || status;
  }

  getRounds(group: LeagueGroup): number[] {
    const rounds = new Set(group.matches.map((m) => m.groupRound ?? 1));
    return [...rounds].sort((a, b) => a - b);
  }

  matchesForRound(group: LeagueGroup, round: number): Match[] {
    return group.matches.filter((m) => (m.groupRound ?? 1) === round);
  }

  getCompletedCount(group: LeagueGroup): number {
    return group.matches.filter((m) => m.status === 'completed').length;
  }

  getTotalMatches(group: LeagueGroup): number {
    return group.matches.length;
  }

  getExpectedMatches(group: LeagueGroup): number {
    if (group.expectedMatches != null) return group.expectedMatches;
    return countRoundRobinMatches(group.teams.length);
  }

  hasIncompleteRoundRobin(group: LeagueGroup): boolean {
    const expected = this.getExpectedMatches(group);
    return expected > 0 && group.matches.length < expected;
  }

  onMatchClick(matchId: string): void {
    this.matchClick.emit(matchId);
  }

  onRegisterResult(match: Match, winnerId: string, event: Event): void {
    event.stopPropagation();
    this.registerResult.emit({ match, winnerId });
  }
}
