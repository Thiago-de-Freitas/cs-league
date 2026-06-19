import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Team, Match } from '../../Models/interfaces';
import { BracketColumnView, buildBracketView } from '../../Utils/bracket.util';

@Component({
  selector: 'app-league-bracket',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './league-bracket.component.html',
  styleUrls: ['./league-bracket.component.css']
})
export class LeagueBracketComponent implements OnChanges {
  @Input() teams: Team[] = [];
  @Input() maxTeams = 8;
  @Input() matches: Match[] = [];

  bracketSize = 8;
  columns: BracketColumnView[] = [];
  hasTeams = false;
  treeHeight = 0;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['teams'] || changes['maxTeams'] || changes['matches']) {
      this.rebuild();
    }
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

  private rebuild(): void {
    this.hasTeams = this.teams.length >= 2;
    if (!this.hasTeams) return;

    const view = buildBracketView(this.teams, this.maxTeams, this.matches);
    this.bracketSize = view.bracketSize;
    this.columns = view.columns;
    const firstRoundMatches = view.columns[0]?.matches.length ?? 1;
    this.treeHeight = firstRoundMatches * 76 + Math.max(0, firstRoundMatches - 1) * 20;
  }
}
