import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../core/auth.service';

export const authGuard: CanActivateFn = async () => {
  const router = inject(Router);
  if (await inject(AuthService).check()) {
    return true;
  }
  return router.parseUrl('/public/login');
};
