import { Component, ElementRef, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { League, LeagueScheduleConfig } from '../../Models/interfaces';
import { LeagueService } from '../../Services/league.service';
import { NotificationService } from '../../Services/notification.service';
import {
  addWeeksToMonday,
  currentWeekMonday,
  formatWeekRange,
  mondayOfWeekContaining,
  toDateInputInTimezone,
} from '../../Utils/schedule-date.util';
import {
  findActiveForwardOverride,
  findOverrideStartingAt,
  getEffectiveDaysForWeekKey,
  isWeekAffectedByOverrides,
  isWeekOverrideBlocked,
} from '../../Utils/week-override.util';

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

  @ViewChild('weekJumpInput') weekJumpInput?: ElementRef<HTMLInputElement>;

  selectedWeekMonday = '';
  overrideDays = new Set<number>();
  overrideMode: 'custom' | 'blocked' = 'custom';
  editingWeekStart: string | null = null;
  weekOverrides: { weekStart: string; daysOfWeek: number[] }[] = [];

  constructor(
    private leagueService: LeagueService,
    private notify: NotificationService
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['league'] && this.league) {
      this.applyLeagueSchedule(this.league);
      if (this.league.scheduleWeekOverrides) {
        this.weekOverrides = this.league.scheduleWeekOverrides;
      }
    }
    if (this.canManage && !this.selectedWeekMonday && !this.editingWeekStart) {
      this.selectedWeekMonday = currentWeekMonday(this.scheduleTimezone);
      this.applyEditorForSelectedWeek();
    }
  }

  get selectedWeekRangeLabel(): string {
    if (!this.selectedWeekMonday) return '';
    return formatWeekRange(this.selectedWeekMonday, this.scheduleTimezone) ?? this.selectedWeekMonday;
  }

  get hasWeekOverrideForSelected(): boolean {
    if (!this.selectedWeekMonday) return false;
    const defaultDays = this.league?.defaultMatchDays?.length
      ? this.league.defaultMatchDays
      : [...this.selectedDays];
    return isWeekAffectedByOverrides(this.selectedWeekMonday, defaultDays, this.weekOverrides);
  }

  get selectedWeekStatusLabel(): string {
    if (!this.selectedWeekMonday) return 'Padrão da liga';
    const defaultDays = this.league?.defaultMatchDays?.length
      ? this.league.defaultMatchDays
      : [...this.selectedDays];
    const exact = findOverrideStartingAt(this.selectedWeekMonday, this.weekOverrides);
    if (exact && isWeekOverrideBlocked(exact.daysOfWeek)) {
      return 'Semana pausada';
    }
    if (exact && !isWeekOverrideBlocked(exact.daysOfWeek)) {
      return 'Exceção a partir desta semana';
    }
    const active = findActiveForwardOverride(this.selectedWeekMonday, this.weekOverrides);
    if (active) {
      return 'Segue exceção anterior';
    }
    if (!this.hasWeekOverrideForSelected) {
      return 'Padrão da liga';
    }
    return 'Calendário alterado';
  }

  shiftOverrideWeek(deltaWeeks: number): void {
    if (!this.canManage || this.overrideSaving) return;
    const base = this.selectedWeekMonday || currentWeekMonday(this.scheduleTimezone);
    const next = addWeeksToMonday(base, deltaWeeks, this.scheduleTimezone);
    if (next) {
      this.selectedWeekMonday = next;
      this.applyEditorForSelectedWeek();
    }
  }

  goToCurrentWeek(): void {
    if (!this.canManage || this.overrideSaving) return;
    this.selectedWeekMonday = currentWeekMonday(this.scheduleTimezone);
    this.applyEditorForSelectedWeek();
  }

  openWeekDatePicker(): void {
    if (!this.canManage || this.overrideSaving) return;
    const input = this.weekJumpInput?.nativeElement;
    if (!input) return;
    input.value = this.selectedWeekMonday || currentWeekMonday(this.scheduleTimezone);
    if (typeof input.showPicker === 'function') {
      input.showPicker();
      return;
    }
    input.click();
  }

  onWeekDatePicked(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (!value) return;
    const monday = mondayOfWeekContaining(value, this.scheduleTimezone);
    if (monday) {
      this.selectedWeekMonday = monday;
      this.applyEditorForSelectedWeek();
      return;
    }
    this.notify.warning('Data inválida.');
  }

  get defaultScheduleSummary(): string {
    const days = this.league?.defaultMatchDays?.length
      ? this.formatDays(this.league.defaultMatchDays)
      : this.formatDays([...this.selectedDays]);
    const time = this.league?.defaultMatchTime || this.defaultMatchTime;
    return `${days} às ${time}`;
  }

  get overridePreviewText(): string {
    const week = this.selectedWeekRangeLabel;
    if (!week) return '';
    if (this.overrideMode === 'blocked') {
      return 'Nenhum jogo nesta semana — confrontos vão para as semanas seguintes.';
    }
    if (this.overrideDays.size === 0) {
      return 'Selecione em quais dias haverá jogos a partir desta semana.';
    }
    return `Jogos em ${this.formatDays([...this.overrideDays].sort((a, b) => a - b))} a partir desta semana (substitui o padrão daqui para frente).`;
  }

  get isEditingExistingOverride(): boolean {
    return !!this.editingWeekStart && this.editingWeekStart === this.selectedWeekMonday;
  }

  private applyEditorForSelectedWeek(): void {
    const existing = findOverrideStartingAt(this.selectedWeekMonday, this.weekOverrides);
    if (existing) {
      this.editingWeekStart = existing.weekStart;
      if (this.isWeekBlocked(existing)) {
        this.overrideMode = 'blocked';
        this.overrideDays = new Set();
      } else {
        this.overrideMode = 'custom';
        this.overrideDays = new Set(existing.daysOfWeek);
      }
      return;
    }

    this.editingWeekStart = null;
    const defaultDays = this.league?.defaultMatchDays?.length
      ? this.league.defaultMatchDays
      : [...this.selectedDays];
    const effectiveDays = getEffectiveDaysForWeekKey(
      this.selectedWeekMonday,
      defaultDays,
      this.weekOverrides
    );
    const activeForward = findActiveForwardOverride(this.selectedWeekMonday, this.weekOverrides);
    if (activeForward && !isWeekOverrideBlocked(activeForward.daysOfWeek)) {
      this.overrideMode = 'custom';
      this.overrideDays = new Set(effectiveDays);
      return;
    }

    this.overrideMode = 'custom';
    this.overrideDays = new Set(defaultDays);
  }

  private applyLeagueSchedule(league: League): void {
    this.defaultMatchTime = league.defaultMatchTime || '20:00';
    this.scheduleTimezone = league.scheduleTimezone || 'America/Sao_Paulo';
    this.selectedDays = new Set(league.defaultMatchDays || []);
    this.startDateInput = toDateInputInTimezone(league.startDate, this.scheduleTimezone);
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
    this.startDateInput = toDateInputInTimezone(config.startDate, this.scheduleTimezone);
    this.defaultMatchTime = config.defaultMatchTime || '20:00';
    this.scheduleTimezone = config.scheduleTimezone || 'America/Sao_Paulo';
    this.selectedDays = new Set(config.defaultMatchDays || []);
    this.weekOverrides = config.weekOverrides || [];
    if (this.selectedWeekMonday) {
      this.applyEditorForSelectedWeek();
    }
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
    if (!this.canManage || this.overrideMode !== 'custom') return;
    if (this.overrideDays.has(day)) {
      this.overrideDays.delete(day);
    } else {
      this.overrideDays.add(day);
    }
  }

  setOverrideMode(mode: 'custom' | 'blocked'): void {
    if (!this.canManage) return;
    this.overrideMode = mode;
    if (mode === 'blocked') {
      this.overrideDays = new Set();
      return;
    }
    if (this.overrideDays.size === 0) {
      const defaultDays = this.league?.defaultMatchDays?.length
        ? this.league.defaultMatchDays
        : [...this.selectedDays];
      this.overrideDays = new Set(defaultDays);
    }
  }

  isWeekBlocked(override: { daysOfWeek: number[] }): boolean {
    return override.daysOfWeek.length === 0;
  }

  formatOverrideSummary(override: { daysOfWeek: number[] }): string {
    if (this.isWeekBlocked(override)) {
      return 'Sem jogos nesta semana';
    }
    return `A partir desta semana: ${this.formatDays(override.daysOfWeek)}`;
  }

  editWeekOverride(override: { weekStart: string; daysOfWeek: number[] }): void {
    if (!this.canManage) return;
    this.selectedWeekMonday = override.weekStart;
    this.applyEditorForSelectedWeek();
  }

  cancelOverrideEdit(): void {
    this.selectedWeekMonday = currentWeekMonday(this.scheduleTimezone);
    this.applyEditorForSelectedWeek();
  }

  private resetOverrideForm(): void {
    this.selectedWeekMonday = currentWeekMonday(this.scheduleTimezone);
    this.applyEditorForSelectedWeek();
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
        startDate: this.startDateInput,
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
    if (!this.leagueId || !this.canManage || !this.selectedWeekMonday) {
      if (!this.selectedWeekMonday) {
        this.notify.warning('Selecione a semana.');
      }
      return;
    }
    if (this.overrideMode === 'custom' && this.overrideDays.size === 0) {
      this.notify.warning('Selecione pelo menos um dia ou escolha "Sem jogos".');
      return;
    }

    const monday = this.selectedWeekMonday;
    const days =
      this.overrideMode === 'blocked'
        ? []
        : [...this.overrideDays].sort((a, b) => a - b);

    this.overrideSaving = true;
    this.leagueService
      .upsertWeekOverride(this.leagueId, monday, days)
      .subscribe({
        next: () => {
          const wasBlocked = this.overrideMode === 'blocked';
          this.overrideSaving = false;
          this.resetOverrideForm();
          this.loadSchedule();
          this.notify.success(
            wasBlocked
              ? 'Semana pausada. Regenerar o calendário para aplicar.'
              : 'Exceção salva. Regenerar o calendário para aplicar.'
          );
        },
        error: (err) => {
          this.overrideSaving = false;
          this.notify.error(err?.error?.error || 'Erro ao salvar exceção.');
        },
      });
  }

  removeWeekOverride(weekStart: string): void {
    if (!this.leagueId || !this.canManage) return;
    this.leagueService.deleteWeekOverride(this.leagueId, weekStart).subscribe({
      next: () => {
        if (this.editingWeekStart === weekStart) {
          this.resetOverrideForm();
        }
        this.loadSchedule();
        this.notify.success('Exceção removida. Regenerar o calendário para voltar ao padrão.');
      },
      error: (err) => this.notify.error(err?.error?.error || 'Erro ao remover exceção.'),
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
    return formatWeekRange(weekStart, this.scheduleTimezone)
      ?? weekStart;
  }

  formatDays(days: number[]): string {
    const map = Object.fromEntries(this.weekdayOptions.map((o) => [o.value, o.label]));
    return days.map((d) => map[d] || d).join(', ');
  }
}
