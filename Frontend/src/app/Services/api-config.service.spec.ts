import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApiConfigService } from './api-config.service';

describe('ApiConfigService', () => {
  let service: ApiConfigService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), ApiConfigService],
    });
    service = TestBed.inject(ApiConfigService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('getDemoUploadUrl uses direct API URL on localhost dev', () => {
    service.getDemoUploadUrl().subscribe((url) => {
      expect(url).toMatch(/^http:\/\/(localhost|127\.0\.0\.1):3000\/api\/demos\/upload$/);
    });

    const req = httpMock.expectOne('/runtime-config.json');
    req.flush({ apiBaseUrl: '' });
  });

  it('getDemoUploadUrl uses absolute API base in production', () => {
    service.getDemoUploadUrl().subscribe((url) => {
      expect(url).toBe('https://api.example.com/api/demos/upload');
    });

    const req = httpMock.expectOne('/runtime-config.json');
    req.flush({ apiBaseUrl: 'https://api.example.com/' });
  });
});
