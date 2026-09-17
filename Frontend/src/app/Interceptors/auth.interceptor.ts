import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../Services/auth.service';

export function isCredentialCheckRequest(url: string): boolean {
  return url.includes('/api/auth/login')
    || url.includes('/api/auth/register')
    || url.includes('/api/auth/my-leagues');
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.token;
  if (token) {
    req = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
    });
  }
  return next(req).pipe(
    catchError((err) => {
      if (err.status === 401 && !isCredentialCheckRequest(req.url)) {
        auth.logout();
        router.navigate(['/login']);
      }
      return throwError(() => err);
    })
  );
};
