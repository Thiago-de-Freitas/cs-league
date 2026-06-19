import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Team, Match } from '../../Models/interfaces';
import {
  BracketRoundView,
  buildBracketView,
} from '../../Utils/bracket.util';

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
  leftRounds: BracketRoundView[] = [];
  rightRounds: BracketRoundView[] = [];
  semiFinals: BracketRoundView = { matches: [] };
  finalRound: BracketRoundView = { matches: [] };
  hasTeams = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['teams'] || changes['maxTeams'] || changes['matches']) {
      this.rebuild();
    }
  }

  private rebuild(): void {
    this.hasTeams = this.teams.length >= 2;
    if (!this.hasTeams) return;

    const view = buildBracketView(this.teams, this.maxTeams, this.matches);
    this.bracketSize = view.bracketSize;
    this.leftRounds = view.leftRounds;
    this.rightRounds = view.rightRounds;
    this.semiFinals = view.semiFinals;
    this.finalRound = view.finalRound;
  }
}
