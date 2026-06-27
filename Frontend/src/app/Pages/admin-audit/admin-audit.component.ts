import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  AUDIT_PAGE_SIZE_OPTIONS,
  AuditPageSize,
  AuditService,
} from '../../Services/audit.service';
import { AuthService } from '../../Services/auth.service';
import { AuditEvent } from '../../Models/interfaces';
import { formatAuditActor } from '../../Utils/audit-display.util';

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
  actionFilter = '';
  entityTypeFilter = '';

  page = 1;
  pageSize: AuditPageSize = 10;
  total = 0;
  totalPages = 1;

  readonly pageSizeOptions = AUDIT_PAGE_SIZE_OPTIONS;

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

  get rangeLabel(): string {
    if (this.total === 0) return 'Nenhum registro';
    const start = (this.page - 1) * this.pageSize + 1;
    const end = Math.min(this.page * this.pageSize, this.total);
    return `${start}–${end} de ${this.total}`;
  }

  loadEvents(): void {
    this.loading = true;
    this.auditService
      .getGlobalEvents({
        page: this.page,
        pageSize: this.pageSize,
        action: this.actionFilter.trim() || undefined,
        entityType: this.entityTypeFilter.trim() || undefined,
      })
      .subscribe({
        next: (result) => {
          this.events = result.events;
          this.page = result.page ?? this.page;
          this.pageSize = (result.pageSize ?? this.pageSize) as AuditPageSize;
          this.total = result.total ?? 0;
          this.totalPages = result.totalPages ?? 1;
          this.loading = false;
        },
        error: () => {
          this.loading = false;
        },
      });
  }

  applyFilters(): void {
    this.page = 1;
    this.loadEvents();
  }

  onPageSizeChange(): void {
    this.page = 1;
    this.loadEvents();
  }

  goToPage(nextPage: number): void {
    if (nextPage < 1 || nextPage > this.totalPages || nextPage === this.page || this.loading) {
      return;
    }
    this.page = nextPage;
    this.loadEvents();
  }

  formatAction(action: string): string {
    return action.replace(/\./g, ' · ');
  }

  formatActor(event: AuditEvent): string {
    return formatAuditActor(event);
  }

  formatDate(value: string): string {
    return new Date(value).toLocaleString('pt-BR');
  }
}
