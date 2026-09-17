import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { VerifyEmailComponent } from './verify-email.component';
import { AuthService } from '../../Services/auth.service';

describe('VerifyEmailComponent', () => {
  let component: VerifyEmailComponent;
  let fixture: ComponentFixture<VerifyEmailComponent>;
  let authServiceSpy: jasmine.SpyObj<AuthService>;
  let router: Router;

  beforeEach(async () => {
    authServiceSpy = jasmine.createSpyObj('AuthService', ['verifyEmail', 'resendVerification']);

    await TestBed.configureTestingModule({
      imports: [VerifyEmailComponent, ReactiveFormsModule],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authServiceSpy },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: of(
              convertToParamMap({
                email: 'user@test.com',
                masked: 'us***@test.com',
              })
            ),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(VerifyEmailComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    spyOn(router, 'navigate');
    fixture.detectChanges();
  });

  it('normaliza código colado do e-mail com espaço (ex.: 498 501)', () => {
    authServiceSpy.verifyEmail.and.returnValue(
      of({
        token: 'jwt',
        user: { id: 'u1', email: 'user@test.com', displayName: 'User', role: 'USER' },
      })
    );

    const input = document.createElement('input');
    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(pasteEvent, 'clipboardData', {
      value: { getData: () => '498 501' },
    });
    Object.defineProperty(pasteEvent, 'target', { value: input });

    component.onCodePaste(pasteEvent);

    expect(component.form.value.code).toBe('498501');
    component.onSubmit();
    expect(authServiceSpy.verifyEmail).toHaveBeenCalledWith('user@test.com', '498501');
  });

  it('aceita submit com código formatado ainda no form control', () => {
    authServiceSpy.verifyEmail.and.returnValue(
      of({
        token: 'jwt',
        user: { id: 'u1', email: 'user@test.com', displayName: 'User', role: 'USER' },
      })
    );

    component.form.setValue({ code: '123 456' });
    component.onSubmit();

    expect(authServiceSpy.verifyEmail).toHaveBeenCalledWith('user@test.com', '123456');
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
  });
});
