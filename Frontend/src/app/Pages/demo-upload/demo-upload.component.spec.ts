import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { DemoUploadComponent } from './demo-upload.component';
import { DemoService } from '../../Services/demo.service';
import { NotificationService } from '../../Services/notification.service';
import { of } from 'rxjs';

describe('DemoUploadComponent', () => {
  let fixture: ComponentFixture<DemoUploadComponent>;
  let component: DemoUploadComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DemoUploadComponent, RouterModule.forRoot([])],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: DemoService,
          useValue: {
            listDemos: () => of([]),
            pollPendingDemos: () => of([]),
          },
        },
        {
          provide: NotificationService,
          useValue: jasmine.createSpyObj('NotificationService', ['success', 'error', 'info', 'warning']),
        },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParams: {} } },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DemoUploadComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('exibe empty state orientando perfil e envio pela partida', () => {
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Demos de liga');
    expect(text).toContain('demos pessoais no perfil');
    expect(text).toContain('Nenhuma demo de liga ainda');
    expect(text).toContain('Enviar Demo');
  });

  it('abre modal de upload', () => {
    expect(component.showUploadModal).toBeFalse();
    component.openUploadModal();
    expect(component.showUploadModal).toBeTrue();
  });
});
