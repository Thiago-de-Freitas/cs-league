import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GroupPreviewPlan } from '../../Utils/group.util';

@Component({
  selector: 'app-league-groups-preview',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './league-groups-preview.component.html',
  styleUrls: ['./league-groups-preview.component.css'],
})
export class LeagueGroupsPreviewComponent {
  @Input() plans: GroupPreviewPlan[] = [];
  @Input() singleGroup = false;
  @Input() advancePerGroup = 2;
  @Input() maxPairsShown = 12;

  get totalMatches(): number {
    return this.plans.reduce((sum, p) => sum + p.matchCount, 0);
  }

  visiblePairs(plan: GroupPreviewPlan): { team1: string; team2: string }[] {
    return plan.pairs.slice(0, this.maxPairsShown);
  }

  hiddenPairCount(plan: GroupPreviewPlan): number {
    return Math.max(0, plan.pairs.length - this.maxPairsShown);
  }
}
