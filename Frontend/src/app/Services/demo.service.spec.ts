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
    const upload = httpMock.expectOne('/api/demos/upload');
    expect(upload.request.method).toBe('POST');
    expect(upload.request.body instanceof FormData).toBeTrue();
    upload.flush({ id: 'd1', fileName: 'match.dem', status: 'pending' });
  });
});
