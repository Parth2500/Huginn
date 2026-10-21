import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/** Requests whose 401 is an answer, not a sign the session ended. */
const ANSWERS_WITH_401 = ['api/auth/session', 'api/auth/login', 'api/auth/signup'];

/** A 401 from anything else means the session expired or was revoked elsewhere. */
export const sessionInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  return next(req).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        !ANSWERS_WITH_401.some((url) => req.url.endsWith(url))
      ) {
        auth.expire('Your session expired. Sign in again to continue.');
      }
      return throwError(() => error);
    }),
  );
};
