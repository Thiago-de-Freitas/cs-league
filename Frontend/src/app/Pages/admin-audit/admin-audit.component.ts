import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuditService } from '../../Services/audit.service';
import { AuthService } from '../../Services/auth.service';
import { AuditEvent } from '../../Models/interfaces';
import { LeagueActivityComponent } from '../../Components/league-activity/league-activity.component';

@Component({
  selector: 'app-admin-audit',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-audit.component.html',
  styleUrls: ['./admin-audit.component.css'],
})
export class AdminAuditComponent implements OnInit {
  events: AuditEvent[] = [];
  loading = true;
  loadingMore = false;
  nextCursor: string | null = null;
  actionFilter = '';
  entityTypeFilter = '';

  constructor(
    private auditService: AuditService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    if (!this.authService.isSystemAdmin()) {
      this.router.navigate(['/dashboard']);
      return;
    }
    this.loadEvents();
  }

  loadEvents(): void {
    this.loading = true;
    this.auditService.getGlobalEvents({
      action: this.actionFilter.trim() || undefined,
      entityType: this.entityTypeFilter.trim() || undefined,
    }).subscribe({
      next: (page) => {
        this.events = page.events;
        this.nextCursor = page.nextCursor;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      },
    });
  }

  applyFilters(): void {
    this.loadEvents();
  }

  loadMore(): void {
    if (!this.nextCursor || this.loadingMore) return;
    this.loadingMore = true;
    this.auditService.getGlobalEvents({
      cursor: this.nextCursor,
      action: this.actionFilter.trim() || undefined,
      entityType: this.entityTypeFilter.trim() || undefined,
    }).subscribe({
      next: (page) => {
        this.events = [...this.events, ...page.events];
        this.nextCursor = page.nextCursor;
        this.loadingMore = false;
      },
      error: () => {
        this.loadingMore = false;
      },
    });
  }

  formatAction(action: string): string {
    return action.replace(/\./g, ' · ');
  }

  formatActor(event: AuditEvent): string {
    return event.actorLabel || event.actorEmail || event.actorType;
  }

  formatDate(value: string): string {
    return new Date(value).toLocaleString('pt-BR');
  }
}
