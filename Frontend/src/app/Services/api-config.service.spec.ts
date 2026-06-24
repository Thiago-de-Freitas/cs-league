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

  it('getDemoUploadUrl uses relative path when apiBaseUrl is empty', () => {
    service.getDemoUploadUrl().subscribe((url) => {
      expect(url).toBe('/api/demos/upload');
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
