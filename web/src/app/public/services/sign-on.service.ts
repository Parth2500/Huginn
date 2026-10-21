import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { catchError, map, Observable, of, throwError } from 'rxjs';
import { IUser } from 'src/app/models/user.interface';
import { ISignOnService } from './iservices/sign-on.service.interface';

/** Turns an API failure into a sentence that names the problem and the way out. */
export function describeAuthError(error: HttpErrorResponse, action: 'login' | 'register'): string {
  if (error.status === 0 || error.status === 502 || error.status === 504) {
    return "Can't reach the chat server. Check that the API is running, then try again.";
  }
  if (action === 'login' && error.status === 401) {
    return "That email and password don't match. Check them and try again.";
  }
  const message = error.error?.message;
  if (action === 'register' && error.status === 409) {
    return message === 'Email is already in use!'
      ? 'That email already has an account. Sign in instead.'
      : typeof message === 'string' ? message : 'That username or email is already taken.';
  }
  // Validation errors arrive as a list; the first one is enough to act on.
  if (Array.isArray(message) && typeof message[0] === 'string') {
    return message[0];
  }
  return typeof message === 'string'
    ? message
    : 'Something went wrong on the server. Try again in a moment.';
}

@Injectable({
  providedIn: 'root',
})
export class SignOnService implements ISignOnService {
  private httpService = inject(HttpClient);

  createUser(user: IUser): Observable<IUser> {
    return this.httpService.post<IUser>('api/auth/register', user);
  }

  /** The API matches usernames exactly and answers 404 when nobody matches. */
  findByUsername(username: string): Observable<IUser | null> {
    return this.httpService
      .get<IUser | null>(`api/users/username/${encodeURIComponent(username)}`)
      .pipe(
        map((user) => (user && user.Id !== undefined ? user : null)),
        catchError((error: HttpErrorResponse) =>
          error.status === 404 ? of(null) : throwError(() => error)
        )
      );
  }

  /** Username prefix search; the API leaves out the signed-in user. */
  searchUsers(query: string): Observable<IUser[]> {
    return this.httpService
      .get<IUser[]>('api/users/search', { params: { q: query } })
      .pipe(map((users) => (Array.isArray(users) ? users : [])));
  }
}
