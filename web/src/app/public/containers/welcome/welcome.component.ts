import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgClass } from '@angular/common';
import { map } from 'rxjs';
import { AuthService } from 'src/app/core/auth.service';
import { ToastService } from 'src/app/shared/toast/toast.service';
import { normalizeUsername } from 'src/app/shared/username-policy';
import { usernameAvailableValidator, usernameShapeValidator } from 'src/app/shared/username.validators';
import { IconComponent } from '../../../shared/icon/icon.component';
import { AuthLayoutComponent } from '../../components/auth-layout/auth-layout.component';
import { describeAuthError } from '../../services/sign-on.service';

/**
 * The first sign-in through Heimdall: the person has proved who they are at Heimdall and now
 * picks how people find them here. Their Heimdall email stays private and isn't the username.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-welcome',
  templateUrl: './welcome.component.html',
  styleUrls: ['./welcome.component.scss'],
  imports: [AuthLayoutComponent, ReactiveFormsModule, IconComponent, NgClass, RouterLink],
})
export class WelcomeComponent implements OnInit {
  private auth = inject(AuthService);
  private http = inject(HttpClient);
  private router = inject(Router);
  private toast = inject(ToastService);

  /** undefined while asking; null when there's no sign-up waiting (expired or used). */
  readonly pending = signal<{ email: string | null } | null | undefined>(undefined);
  readonly submitting = signal(false);
  readonly submitted = signal(false);
  readonly serverError = signal<string | null>(null);

  readonly form = new FormGroup({
    username: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, usernameShapeValidator()],
      asyncValidators: [usernameAvailableValidator(this.http)],
    }),
    displayName: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(40)] }),
  });

  /** Re-read on every status change, so the hint follows the live availability check. */
  private readonly status = toSignal(this.form.statusChanges.pipe(map(() => this.form.status)));

  async ngOnInit() {
    this.pending.set(await this.auth.pendingSignup());
  }

  get username() {
    return this.form.controls.username;
  }

  usernameMessage(): { kind: 'error' | 'ok' | 'hint' | 'checking'; text: string } {
    this.status();
    const control = this.username;
    if (control.hasError('required') && (control.touched || this.submitted())) {
      return { kind: 'error', text: 'Choose a username.' };
    }
    if (control.value && control.hasError('username')) {
      return { kind: 'error', text: control.getError('username') };
    }
    if (control.pending) {
      return { kind: 'checking', text: 'Checking…' };
    }
    if (control.hasError('usernameTaken')) {
      return { kind: 'error', text: control.getError('usernameTaken') };
    }
    if (control.value && control.valid) {
      return { kind: 'ok', text: `@${normalizeUsername(control.value)} is available.` };
    }
    return { kind: 'hint', text: 'How people find you. 3–24 characters: start with a letter; then letters, numbers, . or _.' };
  }

  async finish() {
    this.submitted.set(true);
    this.serverError.set(null);
    if (this.form.invalid || this.form.pending) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    const { username, displayName } = this.form.getRawValue();
    try {
      const user = await this.auth.completeSignup({
        username: normalizeUsername(username),
        displayName: displayName.trim() || undefined,
      });
      this.toast.success(`Welcome, ${user.displayName || user.username}. Your account is ready.`);
      await this.router.navigate(['/private/dashboard']);
    } catch (error) {
      this.serverError.set(describeAuthError(error as HttpErrorResponse, 'register'));
    } finally {
      this.submitting.set(false);
    }
  }
}
