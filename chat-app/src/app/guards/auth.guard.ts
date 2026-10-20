import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { JwtHelperService } from '@auth0/angular-jwt';
import { ToastService } from '../shared/toast/toast.service';

export const authGuard: CanActivateFn = (route, state) => {
  const router: Router = inject(Router);
  const jwtService: JwtHelperService = inject(JwtHelperService);
  const toast: ToastService = inject(ToastService);

  const hadToken = !!localStorage.getItem('access_token');
  if (hadToken && !jwtService.isTokenExpired()) {
    return true;
  }

  if (hadToken) {
    toast.error('Your session expired. Sign in again to continue.');
  }
  localStorage.clear();
  router.navigate(['']);
  return false;
};
