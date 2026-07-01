import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { AuthService } from '../../Services/auth.service';
import { APP_NAME_PARTS } from '../../Utils/brand';

@Component({
  selector: 'app-verify-email',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './verify-email.component.html',
  styleUrls: ['./verify-email.component.css'],
})
export class VerifyEmailComponent implements OnInit {
  readonly brand = APP_NAME_PARTS;
  form: FormGroup;
  email = '';
  maskedEmail = '';
  errorMsg = '';
  successMsg = '';
  loading = false;
  resendLoading = false;

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService
  ) {
    this.form = this.fb.group({
      code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
    });
  }

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      this.email = (params.get('email') || '').trim().toLowerCase();
      this.maskedEmail = params.get('masked') || this.email;
      if (!this.email) {
        this.router.navigate(['/register']);
      }
    });
  }

  onSubmit(): void {
    if (!this.form.valid || !this.email) {
      this.errorMsg = 'Informe o código de 6 dígitos recebido por e-mail.';
      return;
    }

    this.loading = true;
    this.errorMsg = '';
    this.successMsg = '';
    const code = String(this.form.value.code).replace(/\D/g, '');

    this.authService.verifyEmail(this.email, code).subscribe({
      next: () => {
        this.loading = false;
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.loading = false;
        this.errorMsg = err.error?.error || 'Não foi possível verificar o e-mail.';
      },
    });
  }

  resendCode(): void {
    if (!this.email || this.resendLoading) return;

    this.resendLoading = true;
    this.errorMsg = '';
    this.successMsg = '';

    this.authService.resendVerification(this.email).subscribe({
      next: (res) => {
        this.resendLoading = false;
        this.maskedEmail = res.email;
        this.successMsg = res.message;
      },
      error: (err) => {
        this.resendLoading = false;
        this.errorMsg = err.error?.error || 'Não foi possível reenviar o código.';
      },
    });
  }

  onCodeInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '').slice(0, 6);
    this.form.patchValue({ code: digits }, { emitEvent: false });
    input.value = digits;
  }
}
