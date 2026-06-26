import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { LoginComponent } from './login.component';
import { AuthService } from '../../Services/auth.service';
import { NotificationService } from '../../Services/notification.service';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let authServiceSpy: jasmine.SpyObj<AuthService>;
  let router: Router;
  let notifySpy: jasmine.SpyObj<NotificationService>;

  beforeEach(async () => {
    authServiceSpy = jasmine.createSpyObj('AuthService', ['login', 'logout', 'getMe'], {
      isLoggedIn: false,
    });
    notifySpy = jasmine.createSpyObj('NotificationService', ['info']);

    await TestBed.configureTestingModule({
      imports: [LoginComponent, ReactiveFormsModule],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authServiceSpy },
        { provide: NotificationService, useValue: notifySpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    spyOn(router, 'navigate');
    fixture.detectChanges();
  });

  it('cria o formulário com validadores', () => {
    expect(component.loginForm.valid).toBeFalse();
    component.loginForm.patchValue({ email: 'user@test.com', password: '123456' });
    expect(component.loginForm.valid).toBeTrue();
  });

  it('rejeita submit com formulário inválido', () => {
    component.onSubmit();
    expect(component.loginError).toContain('preencha');
    expect(authServiceSpy.login).not.toHaveBeenCalled();
  });

  it('login com sucesso navega ao dashboard', () => {
    authServiceSpy.login.and.returnValue(
      of({ token: 'jwt', user: { id: 'u1', email: 'u@test.com', displayName: 'User', role: 'USER' } })
    );
    component.loginForm.patchValue({ email: 'user@test.com', password: '123456' });
    component.onSubmit();
    expect(authServiceSpy.login).toHaveBeenCalledWith('user@test.com', '123456');
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('login com erro exibe mensagem', () => {
    authServiceSpy.login.and.returnValue(throwError(() => ({ status: 401, error: { error: 'Credenciais inválidas' } })));
    component.loginForm.patchValue({ email: 'user@test.com', password: 'wrong1' });
    component.onSubmit();
    expect(component.loginError).toBe('Credenciais inválidas');
    expect(authServiceSpy.logout).toHaveBeenCalled();
  });

  it('togglePasswordVisibility alterna flag', () => {
    expect(component.showPassword).toBeFalse();
    component.togglePasswordVisibility();
    expect(component.showPassword).toBeTrue();
  });

  it('loginWithSteam exibe aviso informativo', () => {
    component.loginWithSteam();
    expect(notifySpy.info).toHaveBeenCalled();
  });
});
