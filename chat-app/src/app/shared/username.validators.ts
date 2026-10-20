import { HttpClient } from '@angular/common/http';
import { AbstractControl, AsyncValidatorFn, ValidationErrors, ValidatorFn } from '@angular/forms';
import { catchError, map, Observable, of, switchMap, timer } from 'rxjs';
import { normalizeUsername, usernameProblem } from './username-policy';

/** Shape rules, checked instantly in the browser. Error: { username: message }. */
export function usernameShapeValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const problem = control.value ? usernameProblem(control.value) : null;
    return problem ? { username: problem } : null;
  };
}

/**
 * Availability, asked of the server after a short pause. Error: { usernameTaken: message }.
 * `unchanged` lets the profile form skip the check for the user's current name.
 */
export function usernameAvailableValidator(
  http: HttpClient,
  unchanged: () => string | undefined = () => undefined
): AsyncValidatorFn {
  return (control: AbstractControl): Observable<ValidationErrors | null> => {
    const name = normalizeUsername(control.value);
    if (!name || usernameProblem(name) || name.toLowerCase() === unchanged()?.toLowerCase()) {
      return of(null);
    }
    return timer(350).pipe(
      switchMap(() =>
        http.get<{ available: boolean; reason?: string }>('api/users/username-available', {
          params: { u: name },
        })
      ),
      map((result) => (result.available ? null : { usernameTaken: result.reason ?? 'That username is taken.' })),
      // If the check itself fails, let the server decide on submit.
      catchError(() => of(null))
    );
  };
}
