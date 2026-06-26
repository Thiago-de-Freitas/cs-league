import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DemoService } from './demo.service';
import { ApiConfigService } from './api-config.service';

describe('DemoService', () => {
  let service: DemoService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        DemoService,
        ApiConfigService,
      ],
    });
    service = TestBed.inject(DemoService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('validatePersonalDemo calls GET endpoint', () => {
    service.validatePersonalDemo().subscribe((result) => {
      expect(result.valid).toBeTrue();
    });
    const req = httpMock.expectOne('/api/demos/validate-personal');
    req.flush({ valid: true });
  });

  it('uploadDemoWithProgress posts multipart to configured upload URL', () => {
    const file = new File(['demo'], 'match.dem', { type: 'application/octet-stream' });

    service.uploadDemoWithProgress(file, { isPersonal: true }).subscribe();

    httpMock.expectOne('/runtime-config.json').flush({ apiBaseUrl: '' });
    const upload = httpMock.expectOne((req) => req.url.endsWith('/api/demos/upload'));
    expect(upload.request.method).toBe('POST');
    expect(upload.request.body instanceof FormData).toBeTrue();
    upload.flush({ id: 'd1', fileName: 'match.dem', status: 'pending' });
  });

  it('listPersonalHighlights calls GET endpoint', () => {
    service.listPersonalHighlights().subscribe((result) => {
      expect(result.total).toBe(1);
      expect(result.highlights.length).toBe(1);
    });
    const req = httpMock.expectOne('/api/demos/personal/highlights');
    expect(req.request.method).toBe('GET');
    req.flush({
      total: 1,
      videoExportAvailable: true,
      highlights: [{ id: 'hl-1', demoId: 'demo-1', demoFileName: 'x.dem', type: 'ACE', round: 1, playerName: 'P', description: 'Ace', score: 5 }],
    });
  });

  it('downloadDemoHighlightClip baixa spec VDM da demo', () => {
    service.downloadDemoHighlightClip('demo-1', 'hl-1').subscribe();
    const req = httpMock.expectOne('/api/demos/demo-1/highlights/hl-1/clip?format=vdm');
    expect(req.request.method).toBe('GET');
    req.flush(new Blob(['vdm'], { type: 'text/plain' }));
  });

  it('downloadDemoHighlightVideo baixa MP4 da demo', () => {
    service.downloadDemoHighlightVideo('demo-1', 'hl-1').subscribe();
    const req = httpMock.expectOne('/api/demos/demo-1/highlights/hl-1/video');
    expect(req.request.method).toBe('GET');
    req.flush(new Blob(['mp4'], { type: 'video/mp4' }));
  });

  it('getHighlightProgress consulta progresso da demo', () => {
    service.getHighlightProgress('demo-1').subscribe((progress) => {
      expect(progress.percent).toBe(45);
      expect(progress.phase).toBe('saving');
    });
    const req = httpMock.expectOne('/api/demos/demo-1/highlights/progress');
    expect(req.request.method).toBe('GET');
    req.flush({ percent: 45, phase: 'saving', message: 'Salvando destaques...' });
  });

  it('generateHighlights enfileira extração na demo', () => {
    service.generateHighlights('demo-1').subscribe((res) => {
      expect(res.ok).toBeTrue();
    });
    const req = httpMock.expectOne('/api/demos/demo-1/highlights/generate');
    expect(req.request.method).toBe('POST');
    req.flush({ ok: true, message: 'Geração enfileirada' });
  });

  it('deleteDemoHighlight remove um destaque', () => {
    service.deleteDemoHighlight('demo-1', 'hl-1').subscribe();
    const req = httpMock.expectOne('/api/demos/demo-1/highlights/hl-1');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('deleteAllPersonalHighlights remove todos os destaques pessoais', () => {
    service.deleteAllPersonalHighlights().subscribe((res) => {
      expect(res.deleted).toBe(3);
    });
    const req = httpMock.expectOne('/api/demos/personal/highlights');
    expect(req.request.method).toBe('DELETE');
    req.flush({ ok: true, deleted: 3 });
  });
});
