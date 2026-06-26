import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuditService } from '../../Services/audit.service';
import { AuditEvent } from '../../Models/interfaces';

const ACTION_LABELS: Record<string, string> = {
  'auth.register': 'Cadastro de usuário',
  'auth.login.success': 'Login realizado',
  'auth.login.failed': 'Tentativa de login falhou',
  'user.profile.update': 'Perfil atualizado',
  'user.avatar.upload': 'Foto de perfil enviada',
  'user.avatar.delete': 'Foto de perfil removida',
  'team.create': 'Time criado',
  'team.update': 'Time atualizado',
  'team.delete': 'Time excluído',
  'team.logo.upload': 'Logo do time enviado',
  'team.logo.delete': 'Logo do time removido',
  'team.invite.send': 'Convite enviado',
  'team.invite.accept': 'Convite aceito',
  'team.invite.reject': 'Convite recusado',
  'team.member.add': 'Membro adicionado',
  'team.member.update': 'Membro atualizado',
  'team.member.remove': 'Membro removido',
  'league.create': 'Liga criada',
  'league.update': 'Liga atualizada',
  'league.delete': 'Liga excluída',
  'league.archive': 'Liga arquivada',
  'league.unarchive': 'Liga desarquivada',
  'league.team.register': 'Time inscrito na liga',
  'league.team.bulk_add': 'Times inscritos em massa',
  'league.team.add': 'Time adicionado à liga',
  'league.team.remove': 'Time removido da liga',
  'league.team.reorder': 'Ordem dos times alterada',
  'league.schedule.save': 'Calendário salvo',
  'league.schedule.week.override': 'Exceção semanal aplicada',
  'league.schedule.week.remove': 'Exceção semanal removida',
  'league.schedule.regenerate': 'Calendário regenerado',
  'league.groups.generate': 'Grupos gerados',
  'league.bracket.generate': 'Chaveamento gerado',
  'league.match.create': 'Partida criada',
  'match.result.register': 'Resultado registrado',
  'match.schedule.update': 'Partida remarcada',
  'match.manual_stats.save': 'Stats manuais salvas',
  'demo.upload': 'Demo enviada',
  'demo.delete': 'Demo excluída',
  'demo.reprocess': 'Demo reprocessada',
  'demo.requeue_pending': 'Demos pendentes reenfileiradas',
  'match.demo.link': 'Demo vinculada à partida',
  'demo.processing.start': 'Processamento de demo iniciado',
  'demo.processing.complete': 'Demo processada',
  'demo.processing.fail': 'Falha no processamento da demo',
  'demo.match.map_update': 'Mapa atualizado pela demo',
};

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
    return ACTION_LABELS[action] ?? action.replace(/\./g, ' · ');
  }

  formatActor(event: AuditEvent): string {
    if (event.actorLabel) return event.actorLabel;
    if (event.actorType === 'worker') return 'Worker';
    if (event.actorType === 'system') return 'Sistema';
    if (event.actorType === 'anonymous') return 'Anônimo';
    return 'Usuário';
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

  formatJson(value: unknown): string {
    if (value == null) return '';
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
}
