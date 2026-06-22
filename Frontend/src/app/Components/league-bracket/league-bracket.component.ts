import { Component, Input, OnChanges, Output, EventEmitter, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Team, Match } from '../../Models/interfaces';
import { BracketColumnView, buildBracketView } from '../../Utils/bracket.util';

export interface BracketSeedAssignEvent {
  seed: number;
  teamId: string | null;
}

@Component({
  selector: 'app-league-bracket',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './league-bracket.component.html',
  styleUrls: ['./league-bracket.component.css']
})
export class LeagueBracketComponent implements OnChanges {
  @Input() teams: Team[] = [];
  @Input() bracketSize: number | null = null;
  @Input() matches: Match[] = [];
  @Input() canManage = false;
  @Input() bracketLocked = false;
  @Output() seedAssign = new EventEmitter<BracketSeedAssignEvent>();
  @Output() matchClick = new EventEmitter<string>();

  resolvedBracketSize = 8;
  columns: BracketColumnView[] = [];
  hasTeams = false;
  treeHeight = 0;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['teams'] || changes['bracketSize'] || changes['matches']) {
      this.rebuild();
    }
  }

  get canEditSeeds(): boolean {
    return this.canManage && !this.bracketLocked;
  }

  statusLabel(status?: string): string {
    switch (status) {
      case 'completed': return 'Finalizada';
      case 'in_progress': return 'Em andamento';
      case 'scheduled': return 'Agendada';
      case 'cancelled': return 'Cancelada';
      default: return '';
    }
  }

  teamIdForSeed(seed?: number): string {
    if (!seed) return '';
    const team = this.teams.find((t) => t.seed === seed);
    return team?.id ?? '';
  }

  onSeedChange(seed: number, teamId: string): void {
    this.seedAssign.emit({ seed, teamId: teamId || null });
  }

  onMatchClick(matchId: string | undefined, event: Event): void {
    if (!matchId) return;
    const target = event.target as HTMLElement;
    if (target.closest('select')) return;
    this.matchClick.emit(matchId);
  }

  private rebuild(): void {
    this.hasTeams = this.teams.length >= 2;
    if (!this.hasTeams) return;

    const view = buildBracketView(this.teams, this.teams.length, this.bracketSize, this.matches);
    this.resolvedBracketSize = view.bracketSize;
    this.columns = view.columns;
    const firstRoundMatches = view.columns[0]?.matches.length ?? 1;
    this.treeHeight = firstRoundMatches * 76 + Math.max(0, firstRoundMatches - 1) * 20;
  }
}
