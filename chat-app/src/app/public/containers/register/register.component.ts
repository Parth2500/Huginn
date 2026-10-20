import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, Inject, OnDestroy } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormControl,
  FormGroup,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { finalize, Subscription, switchMap } from 'rxjs';
import { ToastService } from 'src/app/shared/toast/toast.service';
import { normalizeUsername } from 'src/app/shared/username-policy';
import {
  usernameAvailableValidator,
  usernameShapeValidator,
} from 'src/app/shared/username.validators';
import { PasswordStrengthValidator } from '../../helpers/validators/password-strength.validator';
import {
  ISignOnService,
  SignOnToken,
} from '../../services/iservices/sign-on.service.interface';
import { describeAuthError } from '../../services/sign-on.service';

interface PasswordRule {
  label: string;
  test: (value: string) => boolean;
}

@Component({
  selector: 'app-register',
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss'],
})
export class RegisterComponent implements OnDestroy {
  formBuilder: FormBuilder = new FormBuilder();
  registrationForm: FormGroup = this.formBuilder.group({
    email: [null, [Validators.required, Validators.email]],
    username: [
      null,
      [Validators.required, usernameShapeValidator()],
      [usernameAvailableValidator(this.http)],
    ],
    password: [
      null,
      [
        Validators.required,
        Validators.minLength(8),
        Validators.maxLength(20),
        PasswordStrengthValidator(),
      ],
    ],
    confirmPassword: [
      null,
      [Validators.required, this.confirmPasswordValidator()],
    ],
  });

  // Mirrors PasswordStrengthValidator and the length validators above.
  readonly passwordRules: PasswordRule[] = [
    { label: '8 to 20 characters', test: (v) => v.length >= 8 && v.length <= 20 },
    { label: 'An uppercase letter', test: (v) => /[A-Z]/.test(v) },
    { label: 'A lowercase letter', test: (v) => /[a-z]/.test(v) },
    { label: 'A number', test: (v) => /[0-9]/.test(v) },
    { label: 'A symbol: # ? ! @ $ % ^ & * -', test: (v) => /[#?!@$%^&*-]/.test(v) },
  ];

  submitting = false;
  submitted = false;
  serverError: string | null = null;
  showPassword = false;

  private passwordChanges: Subscription = this.password.valueChanges.subscribe(() =>
    this.confirmPassword.updateValueAndValidity({ emitEvent: false })
  );

  constructor(
    private http: HttpClient,
    @Inject(SignOnToken) private signOnService: ISignOnService,
    private router: Router,
    private toast: ToastService
  ) {}

  ngOnDestroy(): void {
    this.passwordChanges.unsubscribe();
  }

  register() {
    this.submitted = true;
    this.serverError = null;
    if (this.registrationForm.invalid) {
      this.registrationForm.markAllAsTouched();
      return;
    }

    this.submitting = true;
    const credentials = { email: this.email.value, password: this.password.value };
    let created = false;
    this.signOnService
      .createUser({ ...credentials, username: normalizeUsername(this.username.value) })
      .pipe(
        // Sign straight in, so a new account lands in the app rather than back on a form.
        switchMap((user) => {
          created = true;
          this.toast.success(`Welcome, ${user.username ?? 'there'}. Your account is ready.`);
          return this.signOnService.loginUser(credentials);
        }),
        finalize(() => (this.submitting = false))
      )
      .subscribe({
        next: () => this.router.navigate(['/private/dashboard']),
        error: (error: HttpErrorResponse) => {
          if (created) {
            this.router.navigate(['/public/login'], { queryParams: { email: credentials.email } });
            return;
          }
          this.serverError = describeAuthError(error, 'register');
        },
      });
  }

  /** What to say under the username field: an error, a pending check, availability or a hint. */
  get usernameMessage(): { kind: 'error' | 'ok' | 'hint' | 'checking'; text: string } {
    const control = this.username;
    if (control.hasError('required') && (control.touched || this.submitted)) {
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

  showError(control: FormControl): boolean {
    return control.invalid && (control.touched || this.submitted);
  }

  ruleMet(rule: PasswordRule): boolean {
    return rule.test(this.password.value ?? '');
  }

  get email(): FormControl {
    return this.getFormControl('email');
  }

  get username(): FormControl {
    return this.getFormControl('username');
  }

  get password(): FormControl {
    return this.getFormControl('password');
  }

  get confirmPassword(): FormControl {
    return this.getFormControl('confirmPassword');
  }

  getFormControl(controlName: string): FormControl {
    return this.registrationForm.get(controlName) as FormControl;
  }

  confirmPasswordValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = control.value;

      if (!value) {
        return null;
      }

      return value !== this.password.value ? { match: true } : null;
    };
  }
}
