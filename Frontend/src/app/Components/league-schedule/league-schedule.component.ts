import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { League, LeagueScheduleConfig } from '../../Models/interfaces';
import { LeagueService } from '../../Services/league.service';
import { NotificationService } from '../../Services/notification.service';

interface WeekdayOption {
  value: number;
  label: string;
}

@Component({
  selector: 'app-league-schedule',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './league-schedule.component.html',
  styleUrls: ['./league-schedule.component.css'],
})
export class LeagueScheduleComponent implements OnChanges {
  @Input() leagueId = '';
  @Input() league: League | null = null;
  @Input() canManage = false;
  @Input() groupPhaseGenerated = false;
  @Output() scheduleUpdated = new EventEmitter<League>();

  readonly weekdayOptions: WeekdayOption[] = [
    { value: 1, label: 'Seg' },
    { value: 2, label: 'Ter' },
    { value: 3, label: 'Qua' },
    { value: 4, label: 'Qui' },
    { value: 5, label: 'Sex' },
    { value: 6, label: 'Sáb' },
    { value: 0, label: 'Dom' },
  ];

  loading = false;
  saving = false;
  regenerating = false;
  overrideSaving = false;

  startDateInput = '';
  defaultMatchTime = '20:00';
  scheduleTimezone = 'America/Sao_Paulo';
  selectedDays = new Set<number>();

  overrideWeekStart = '';
  overrideDays = new Set<number>();
  weekOverrides: { weekStart: string; daysOfWeek: number[] }[] = [];

  constructor(
    private leagueService: LeagueService,
    private notify: NotificationService
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['league'] && this.league) {
      this.applyLeagueSchedule(this.league);
    }
    if (changes['leagueId'] && this.leagueId) {
      this.loadSchedule();
    }
  }

  private applyLeagueSchedule(league: League): void {
    this.defaultMatchTime = league.defaultMatchTime || '20:00';
    this.scheduleTimezone = league.scheduleTimezone || 'America/Sao_Paulo';
    this.selectedDays = new Set(league.defaultMatchDays || []);
    this.startDateInput = this.toDateInputValue(league.startDate);
  }

  loadSchedule(): void {
    if (!this.leagueId) return;
    this.loading = true;
    this.leagueService.getSchedule(this.leagueId).subscribe({
      next: (config) => {
        this.applyConfig(config);
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      },
    });
  }

  private applyConfig(config: LeagueScheduleConfig): void {
    this.startDateInput = this.toDateInputValue(config.startDate);
    this.defaultMatchTime = config.defaultMatchTime || '20:00';
    this.scheduleTimezone = config.scheduleTimezone || 'America/Sao_Paulo';
    this.selectedDays = new Set(config.defaultMatchDays || []);
    this.weekOverrides = config.weekOverrides || [];
  }

  isDaySelected(day: number): boolean {
    return this.selectedDays.has(day);
  }

  isOverrideDaySelected(day: number): boolean {
    return this.overrideDays.has(day);
  }

  toggleDay(day: number): void {
    if (!this.canManage) return;
    if (this.selectedDays.has(day)) {
      this.selectedDays.delete(day);
    } else {
      this.selectedDays.add(day);
    }
  }

  toggleOverrideDay(day: number): void {
    if (!this.canManage) return;
    if (this.overrideDays.has(day)) {
      this.overrideDays.delete(day);
    } else {
      this.overrideDays.add(day);
    }
  }

  saveSchedule(): void {
    if (!this.leagueId || !this.canManage) return;
    if (!this.startDateInput) {
      this.notify.warning('Informe a data de início da liga.');
      return;
    }
    if (this.selectedDays.size === 0) {
      this.notify.warning('Selecione pelo menos um dia da semana.');
      return;
    }

    this.saving = true;
    this.leagueService
      .updateSchedule(this.leagueId, {
        startDate: new Date(this.startDateInput + 'T12:00:00').toISOString(),
        defaultMatchDays: [...this.selectedDays].sort((a, b) => a - b),
        defaultMatchTime: this.defaultMatchTime,
        scheduleTimezone: this.scheduleTimezone,
      })
      .subscribe({
        next: (config) => {
          this.applyConfig(config);
          this.saving = false;
          this.notify.success('Calendário salvo.');
          if (this.league) {
            this.scheduleUpdated.emit({
              ...this.league,
              startDate: config.startDate,
              endDate: config.endDate,
              defaultMatchDays: config.defaultMatchDays,
              defaultMatchTime: config.defaultMatchTime,
              scheduleTimezone: config.scheduleTimezone,
              scheduleConfigured: config.scheduleConfigured,
            });
          }
        },
        error: (err) => {
          this.saving = false;
          this.notify.error(err?.error?.error || 'Erro ao salvar calendário.');
        },
      });
  }

  saveWeekOverride(): void {
    if (!this.leagueId || !this.canManage || !this.overrideWeekStart) return;
    if (this.overrideDays.size === 0) {
      this.notify.warning('Selecione pelo menos um dia para a semana.');
      return;
    }

    const monday = this.normalizeToMonday(this.overrideWeekStart);
    if (!monday) {
      this.notify.warning('A semana deve começar em uma segunda-feira.');
      return;
    }

    this.overrideSaving = true;
    this.leagueService
      .upsertWeekOverride(this.leagueId, monday, [...this.overrideDays].sort((a, b) => a - b))
      .subscribe({
        next: () => {
          this.overrideSaving = false;
          this.overrideWeekStart = '';
          this.overrideDays = new Set();
          this.loadSchedule();
          this.notify.success('Semana personalizada salva.');
        },
        error: (err) => {
          this.overrideSaving = false;
          this.notify.error(err?.error?.error || 'Erro ao salvar semana.');
        },
      });
  }

  removeWeekOverride(weekStart: string): void {
    if (!this.leagueId || !this.canManage) return;
    this.leagueService.deleteWeekOverride(this.leagueId, weekStart).subscribe({
      next: () => {
        this.loadSchedule();
        this.notify.success('Override removido.');
      },
      error: (err) => this.notify.error(err?.error?.error || 'Erro ao remover semana.'),
    });
  }

  regenerateSchedule(): void {
    if (!this.leagueId || !this.canManage) return;
    this.regenerating = true;
    this.leagueService.regenerateSchedule(this.leagueId).subscribe({
      next: (res) => {
        this.regenerating = false;
        this.applyConfig({
          startDate: res.league.startDate as string,
          endDate: res.league.endDate as string,
          defaultMatchDays: res.league.defaultMatchDays || [],
          defaultMatchTime: res.league.defaultMatchTime || '20:00',
          scheduleTimezone: res.league.scheduleTimezone || 'America/Sao_Paulo',
          scheduleConfigured: res.league.scheduleConfigured,
          weekOverrides: this.weekOverrides,
        });
        this.scheduleUpdated.emit(res.league);
        this.notify.success(`Calendário regenerado (${res.updatedCount} jogos).`);
      },
      error: (err) => {
        this.regenerating = false;
        this.notify.error(err?.error?.error || 'Erro ao regenerar calendário.');
      },
    });
  }

  formatWeekLabel(weekStart: string): string {
    const d = new Date(weekStart + 'T12:00:00');
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  formatDays(days: number[]): string {
    const map = Object.fromEntries(this.weekdayOptions.map((o) => [o.value, o.label]));
    return days.map((d) => map[d] || d).join(', ');
  }

  private toDateInputValue(value?: Date | string | null): string {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  private normalizeToMonday(dateStr: string): string | null {
    const d = new Date(dateStr + 'T12:00:00');
    if (Number.isNaN(d.getTime())) return null;
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
}
