import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { TeamService } from '../../Services/team.service';
import { Team, TeamInvite } from '../../Models/interfaces';

@Component({
  selector: 'app-team-details',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './team-details.component.html',
  styleUrls: ['./team-details.component.css']
})
export class TeamDetailsComponent implements OnInit {
  teamId: string | null = null;
  team: Team | null = null;
  pendingInvites: TeamInvite[] = [];
  loading = true;
  errorMsg = '';

  constructor(
    private route: ActivatedRoute,
    private teamService: TeamService
  ) {}

  ngOnInit(): void {
    this.teamId = this.route.snapshot.paramMap.get('id');
    if (this.teamId) {
      this.loadTeam(this.teamId);
    }
    this.teamService.getPendingInvites().subscribe({
      next: (invites) => (this.pendingInvites = invites)
    });
  }

  loadTeam(id: string): void {
    this.loading = true;
    this.teamService.getTeamById(id).subscribe({
      next: (team) => {
        this.team = team;
        this.loading = false;
      },
      error: () => {
        this.errorMsg = 'Time não encontrado.';
        this.loading = false;
      }
    });
  }

  acceptInvite(invite: TeamInvite): void {
    if (!invite.team) return;
    this.teamService.acceptInvite(invite.team.id, invite.id).subscribe({
      next: () => {
        this.pendingInvites = this.pendingInvites.filter((i) => i.id !== invite.id);
        if (this.teamId) this.loadTeam(this.teamId);
      }
    });
  }
}
