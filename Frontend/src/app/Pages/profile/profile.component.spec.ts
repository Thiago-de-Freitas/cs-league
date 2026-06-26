import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { provideRouter } from '@angular/router';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { ProfileComponent } from './profile.component';
import { AuthService } from '../../Services/auth.service';
import { DemoService } from '../../Services/demo.service';
import { NotificationService } from '../../Services/notification.service';
import { PersonalStatsOverview } from '../../Models/interfaces';

const emptyOverview: PersonalStatsOverview = {
  summary: {
    demosTotal: 0,
    demosCompleted: 0,
    kills: 0,
    deaths: 0,
    kd: 0,
    adr: 0,
    hsPercent: 0,
    kast: 0,
    rating: 0,
  },
  demos: [],
};

describe('ProfileComponent', () => {
  let component: ProfileComponent;
  let fixture: ComponentFixture<ProfileComponent>;
  let demoServiceSpy: jasmine.SpyObj<DemoService>;
  let notifySpy: jasmine.SpyObj<NotificationService>;

  beforeEach(async () => {
    demoServiceSpy = jasmine.createSpyObj('DemoService', [
      'getPersonalStatsOverview',
      'listPersonalDemos',
      'listPersonalHighlights',
      'getDemoHealthConfig',
    ]);
    notifySpy = jasmine.createSpyObj('NotificationService', ['success', 'error', 'info']);

    demoServiceSpy.getPersonalStatsOverview.and.returnValue(of(emptyOverview));
    demoServiceSpy.listPersonalDemos.and.returnValue(of([]));
    demoServiceSpy.getDemoHealthConfig.and.returnValue(of({ redis: { queueAvailable: true } }));

    await TestBed.configureTestingModule({
      imports: [ProfileComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: of(convertToParamMap({})),
          },
        },
        {
          provide: AuthService,
          useValue: {
            getMe: () =>
              of({
                displayName: 'Player',
                email: 'p@test.com',
                steamId: '76561198000000000',
                role: 'USER',
              }),
          },
        },
        { provide: DemoService, useValue: demoServiceSpy },
        { provide: NotificationService, useValue: notifySpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProfileComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('não carrega destaques automaticamente na aba stats', () => {
    expect(demoServiceSpy.listPersonalHighlights).not.toHaveBeenCalled();
    expect(component.activeTab).toBe('stats');
  });

  it('carrega destaques ao abrir a aba', () => {
    demoServiceSpy.listPersonalHighlights.and.returnValue(
      of({ highlights: [], total: 0, videoExportAvailable: false })
    );
    component.setTab('highlights');
    expect(demoServiceSpy.listPersonalHighlights).toHaveBeenCalled();
    expect(component.highlightsLoading).toBeFalse();
    expect(component.personalHighlights).toEqual([]);
  });

  it('exibe erro detalhado quando API de destaques falha', () => {
    demoServiceSpy.listPersonalHighlights.and.returnValue(
      throwError(() => ({ status: 503, error: { error: 'Banco desatualizado' } }))
    );
    component.setTab('highlights');
    expect(component.highlightsLoadError).toContain('Banco desatualizado');
    expect(notifySpy.error).toHaveBeenCalled();
  });

  it('trata falha de conexão ao carregar destaques', () => {
    demoServiceSpy.listPersonalHighlights.and.returnValue(throwError(() => ({ status: 0 })));
    component.setTab('highlights');
    expect(component.highlightsLoadError).toContain('conectar à API');
  });
});
