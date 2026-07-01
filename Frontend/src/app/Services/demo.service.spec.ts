import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DemoService } from './demo.service';

describe('DemoService', () => {
  let service: DemoService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        DemoService,
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

  it('uploadDemoWithProgress uses chunked upload via same-origin API', fakeAsync(() => {
    const file = new File(['demo-content'], 'match.dem', { type: 'application/octet-stream' });
    const events: number[] = [];

    service.uploadDemoWithProgress(file, { isPersonal: true }).subscribe((event) => {
      if (event.phase === 'uploading') {
        events.push(event.progress);
      }
    });

    const config = httpMock.expectOne('/api/health/config');
    config.flush({ demoUploadChunkBytes: 4 * 1024 * 1024 });
    tick();

    const session = httpMock.expectOne('/api/demos/upload/sessions');
    expect(session.request.method).toBe('POST');
    session.flush({ uploadId: 'up-1', chunkBytes: 4 * 1024 * 1024, totalChunks: 1 });
    tick();

    const chunk = httpMock.expectOne('/api/demos/upload/sessions/up-1/chunks/0');
    expect(chunk.request.method).toBe('PUT');
    chunk.flush({ ok: true, index: 0, received: file.size });
    tick();

    const complete = httpMock.expectOne('/api/demos/upload/sessions/up-1/complete');
    expect(complete.request.method).toBe('POST');
    complete.flush({ id: 'd1', fileName: 'match.dem', status: 'pending' });
    tick();

    expect(events.length).toBeGreaterThan(0);
  }));

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
