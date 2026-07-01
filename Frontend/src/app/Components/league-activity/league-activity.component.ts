import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuditService } from '../../Services/audit.service';
import { AuditEvent } from '../../Models/interfaces';
import { formatAuditActor, formatAuditAction, formatAuditJson, hasAuditDetails } from '../../Utils/audit-display.util';

@Component({
  selector: 'app-league-activity',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './league-activity.component.html',
  styleUrls: ['./league-activity.component.css'],
})
export class LeagueActivityComponent implements OnInit {
  @Input({ required: true }) leagueId!: string;

  events: AuditEvent[] = [];
  loading = true;
  loadingMore = false;
  nextCursor: string | null = null;
  expandedIds = new Set<string>();

  constructor(private auditService: AuditService) {}

  ngOnInit(): void {
    this.loadEvents();
  }

  loadEvents(): void {
    this.loading = true;
    this.auditService.getLeagueActivity(this.leagueId).subscribe({
      next: (page) => {
        this.events = page.events;
        this.nextCursor = page.nextCursor ?? null;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      },
    });
  }

  loadMore(): void {
    if (!this.nextCursor || this.loadingMore) return;
    this.loadingMore = true;
    this.auditService.getLeagueActivity(this.leagueId, 50, this.nextCursor).subscribe({
      next: (page) => {
        this.events = [...this.events, ...page.events];
        this.nextCursor = page.nextCursor ?? null;
        this.loadingMore = false;
      },
      error: () => {
        this.loadingMore = false;
      },
    });
  }

  formatAction(action: string): string {
    return formatAuditAction(action);
  }

  formatActor(event: AuditEvent): string {
    return formatAuditActor(event);
  }

  formatDate(value: string): string {
    return new Date(value).toLocaleString('pt-BR');
  }

  toggleDetails(eventId: string): void {
    if (this.expandedIds.has(eventId)) {
      this.expandedIds.delete(eventId);
    } else {
      this.expandedIds.add(eventId);
    }
  }

  isExpanded(eventId: string): boolean {
    return this.expandedIds.has(eventId);
  }

  hasDetails(event: AuditEvent): boolean {
    return hasAuditDetails(event);
  }

  formatJson(value: unknown): string {
    return formatAuditJson(value);
  }
}
