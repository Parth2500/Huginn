import { inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CanActivateFn, Router } from '@angular/router';
import { JwtHelperService } from '@auth0/angular-jwt';

export const authGuard: CanActivateFn = (route, state) => {
  const router: Router = inject(Router);
  const jwtService: JwtHelperService = inject(JwtHelperService);
  const snackBar: MatSnackBar = inject(MatSnackBar);

  if (!jwtService.isTokenExpired()) {
    return true;
  }

  snackBar.open(`Session Expired!`, 'Close', {
    duration: 5000,
    horizontalPosition: 'right',
    verticalPosition: 'top',
  });
  localStorage.clear();
  router.navigate(['']);
  return false;
};
