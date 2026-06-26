import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, RouterModule } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { MatchDetailsComponent } from './match-details.component';
import { MatchService } from '../../Services/match.service';
import { AuthService } from '../../Services/auth.service';
import { DemoService } from '../../Services/demo.service';
import { NotificationService } from '../../Services/notification.service';
import { Demo, Match, MatchPlayerStat } from '../../Models/interfaces';

function mockMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: 'match-1',
    status: 'scheduled',
    team1: { id: 't1', name: 'Time 1', tag: 'T1', players: [], wins: 0, losses: 0, draws: 0, points: 0, roundsWon: 0, roundsLost: 0 },
    team2: { id: 't2', name: 'Time 2', tag: 'T2', players: [], wins: 0, losses: 0, draws: 0, points: 0, roundsWon: 0, roundsLost: 0 },
    mapVetoEnabled: true,
    permissions: { canRegisterResult: true, canEditManualStats: true, captainTeamIds: [] },
    demos: [],
    ...overrides,
  } as Match;
}

describe('MatchDetailsComponent', () => {
  let component: MatchDetailsComponent;
  let fixture: ComponentFixture<MatchDetailsComponent>;
  let matchServiceSpy: jasmine.SpyObj<MatchService>;
  let demoServiceSpy: jasmine.SpyObj<DemoService>;
  const paramMap$ = new BehaviorSubject(convertToParamMap({ id: 'match-1' }));

  const routeConfig = {
    paramMap: paramMap$.asObservable(),
    snapshot: { url: [{ path: 'match' }] },
  };

  beforeEach(async () => {
    paramMap$.next(convertToParamMap({ id: 'match-1' }));
    routeConfig.snapshot = { url: [{ path: 'match' }] };
    matchServiceSpy = jasmine.createSpyObj('MatchService', ['getMatch', 'registerResult', 'saveManualStats']);
    demoServiceSpy = jasmine.createSpyObj('DemoService', ['getDemo', 'pollDemoStatus']);

    matchServiceSpy.getMatch.and.returnValue(of(mockMatch()));
    demoServiceSpy.getDemo.and.returnValue(
      of({ id: 'demo-1', status: 'completed', stats: [], fileName: 'demo.dem' } as unknown as Demo)
    );

    await TestBed.configureTestingModule({
      imports: [MatchDetailsComponent, RouterModule.forRoot([])],
      providers: [
        { provide: MatchService, useValue: matchServiceSpy },
        { provide: DemoService, useValue: demoServiceSpy },
        { provide: AuthService, useValue: jasmine.createSpyObj('AuthService', ['isSystemAdmin']) },
        { provide: NotificationService, useValue: jasmine.createSpyObj('NotificationService', ['success', 'error', 'info']) },
        {
          provide: ActivatedRoute,
          useValue: routeConfig,
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MatchDetailsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture?.destroy();
  });

  it('carrega partida pelo id da rota', () => {
    expect(matchServiceSpy.getMatch).toHaveBeenCalledWith('match-1');
    expect(component.match?.id).toBe('match-1');
    expect(component.isDemoView).toBeFalse();
  });

  it('canRegisterResult respeita permissões', () => {
    expect(component.canRegisterResult).toBeTrue();
    component.match = mockMatch({ permissions: { canRegisterResult: false } });
    expect(component.canRegisterResult).toBeFalse();
  });

  it('isBo3Match detecta série BO3', () => {
    component.match = mockMatch({
      league: { seriesFormat: 'bo3' } as never,
      series: {
        series: { format: 'bo3', vetoStatus: 'ban_pick', team1MapWins: 1, team2MapWins: 0 } as never,
        matches: [],
      },
    });
    expect(component.isBo3Match).toBeTrue();
    expect(component.showSeriesPanel).toBeTrue();
    expect(component.seriesMapWins).toContain('1');
  });

  it('showMatchVeto para BO1 com veto habilitado', () => {
    component.match = mockMatch({
      mapVetoEnabled: true,
      mapVeto: { status: 'banning' } as never,
      league: { seriesFormat: 'bo1' } as never,
    });
    expect(component.showMatchVeto).toBeTrue();
  });

  it('matchTotalRounds soma placar', () => {
    component.match = mockMatch({ team1Rounds: 13, team2Rounds: 7 });
    expect(component.matchTotalRounds).toBe(20);
  });

  it('buildAggregatedStats agrega demos concluídas', () => {
    const stat = {
      id: 's1',
      demoId: 'd1',
      playerName: 'Player',
      teamId: 't1',
      kills: 20,
      deaths: 10,
      assists: 5,
      hsPercent: 50,
      damage: 2000,
      adr: 100,
      kast: 70,
    } as MatchPlayerStat;
    const stats = component.buildAggregatedStats([
      { id: 'd1', status: 'completed', stats: [stat], fileName: 'a.dem' } as unknown as Demo,
      { id: 'd2', status: 'pending', stats: [], fileName: 'b.dem' } as unknown as Demo,
    ]);
    expect(stats.length).toBe(1);
    expect(stats[0].kills).toBe(20);
  });

  it('getKd formata razão kills/deaths', () => {
    expect(component.getKd({ kills: 20, deaths: 10 } as MatchPlayerStat)).toBe('2.00');
    expect(component.getKd({ kills: 5, deaths: 0 } as MatchPlayerStat)).toBe('5');
  });

  it('loadDemo carrega demo e marca visualização', () => {
    component.loadDemo('demo-1');
    expect(demoServiceSpy.getDemo).toHaveBeenCalledWith('demo-1');
    expect(component.isDemoView).toBeTrue();
  });

  it('loadMatch trata erro 403', () => {
    matchServiceSpy.getMatch.and.returnValue(throwError(() => ({ status: 403 })));
    component.loadMatch('match-x');
    expect(component.errorMsg).toContain('permissão');
  });
});
