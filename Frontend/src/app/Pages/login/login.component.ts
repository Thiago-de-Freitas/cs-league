import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../Services/auth.service';
import { NotificationService } from '../../Services/notification.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent implements OnInit {
  loginForm: FormGroup;
  loginError = '';
  loading = false;
  showPassword = false;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private authService: AuthService,
    private notify: NotificationService
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  ngOnInit(): void {
    if (!this.authService.isLoggedIn) return;
    this.authService.getMe().subscribe({
      next: () => this.router.navigate(['/dashboard']),
      error: () => this.authService.logout(),
    });
  }

  onSubmit(): void {
    if (!this.loginForm.valid) {
      this.loginError = 'Por favor, preencha todos os campos corretamente.';
      return;
    }

    this.loading = true;
    this.loginError = '';
    const { email, password } = this.loginForm.value;

    this.authService.login(email, password).subscribe({
      next: () => {
        this.loading = false;
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.loading = false;
        if (err.status === 401) this.authService.logout();
        this.loginError = err.error?.error || 'Erro ao fazer login.';
      }
    });
  }

  loginWithSteam(): void {
    this.notify.info(
      'Por enquanto, edite o Steam ID no seu perfil após o login.',
      'Steam em breve',
      { hint: 'O login via Steam será implementado em uma fase futura.' }
    );
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }
}
