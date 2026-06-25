import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GroupStanding, LeagueGroup, Match } from '../../Models/interfaces';
import { countRoundRobinMatches } from '../../Utils/group.util';
import { formatDateInTimezone, formatScheduledAtInTimezone } from '../../Utils/schedule-date.util';

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
  @Input() scheduleTimezone = 'America/Sao_Paulo';
  @Input() canRegisterResult?: (match: Match) => boolean;
  @Output() matchClick = new EventEmitter<string>();
  @Output() registerResult = new EventEmitter<Match>();
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

  onRegisterResult(match: Match, event: Event): void {
    event.stopPropagation();
    this.registerResult.emit(match);
  }

  formatMatchScore(match: Match): string | null {
    if (match.team1Rounds == null || match.team2Rounds == null) return null;
    return `${match.team1Rounds} x ${match.team2Rounds}`;
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
    const fmt = (d: Date) => formatDateInTimezone(d, this.scheduleTimezone) ?? '';
    if (fmt(first) === fmt(last)) return fmt(first);
    return `${fmt(first)} – ${fmt(last)}`;
  }

  formatScheduledAt(value?: string | null): string | null {
    return formatScheduledAtInTimezone(value, this.scheduleTimezone);
  }

  roundDifference(row: GroupStanding): number {
    return row.roundDifference;
  }

  formatRoundDifference(row: GroupStanding): string {
    const diff = this.roundDifference(row);
    if (diff > 0) return `+${diff}`;
    return String(diff);
  }
}
