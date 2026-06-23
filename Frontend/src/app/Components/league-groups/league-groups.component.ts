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
  @Input() canManageSchedule = false;
  @Input() canRegisterResult?: (match: Match) => boolean;
  @Output() matchClick = new EventEmitter<string>();
  @Output() registerResult = new EventEmitter<{ match: Match; winnerId: string }>();
  @Output() reschedule = new EventEmitter<Match>();

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

  onReschedule(match: Match, event: Event): void {
    event.stopPropagation();
    this.reschedule.emit(match);
  }

  getRoundDateLabel(group: LeagueGroup, round: number): string | null {
    const matches = this.matchesForRound(group, round);
    const dates = matches
      .map((m) => m.scheduledAt)
      .filter((d): d is string => !!d)
      .map((d) => new Date(d).getTime())
      .sort((a, b) => a - b);
    if (dates.length === 0) return null;
    const first = new Date(dates[0]);
    const last = new Date(dates[dates.length - 1]);
    const fmt = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    if (fmt(first) === fmt(last)) return fmt(first);
    return `${fmt(first)} – ${fmt(last)}`;
  }

  formatScheduledAt(value?: string | null): string | null {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }
}
