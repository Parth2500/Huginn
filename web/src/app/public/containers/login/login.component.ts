import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from 'src/app/core/auth.service';
import { describeAuthError } from '../../services/sign-on.service';
import { AuthLayoutComponent } from '../../components/auth-layout/auth-layout.component';

import { IconComponent } from '../../../shared/icon/icon.component';

/** What `?heimdall=` on this page means (set by the API's Heimdall callback). */
const HEIMDALL_OUTCOMES: Record<string, string> = {
  cancelled: 'Sign-in with Heimdall was cancelled. Try again, or use your password.',
  failed: "Heimdall couldn't confirm the sign-in. Try again.",
  unavailable: "Can't reach Heimdall right now. Try again, or sign in with your password.",
};

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
    selector: 'app-login',
    templateUrl: './login.component.html',
    styleUrls: ['./login.component.scss'],
    imports: [
    AuthLayoutComponent,
    FormsModule,
    ReactiveFormsModule,
    IconComponent,
    RouterLink
],
})
export class LoginComponent implements OnInit {
  private auth = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  formBuilder: FormBuilder = new FormBuilder();
  loginForm: FormGroup = this.formBuilder.group({
    email: [null, [Validators.required, Validators.email]],
    password: [null, [Validators.required]],
  });

  submitting = false;
  submitted = false;
  serverError: string | null = null;
  showPassword = false;
  /** Whether this server offers sign-in with Heimdall. */
  heimdall = false;
  /** Information, not an error: shown above the form. */
  notice: string | null = null;

  ngOnInit(): void {
    // Already signed in (another tab, or a refresh): go straight to the app.
    void this.auth.check().then((me) => {
      if (me) {
        void this.router.navigate(['/private/dashboard']);
      }
    });
    void this.auth.providers().then((offered) => {
      this.heimdall = offered.heimdall;
      this.cdr.markForCheck();
    });
    // Back from Heimdall without signing in: say why.
    const outcome = this.route.snapshot.queryParamMap.get('heimdall');
    if (outcome) {
      this.serverError = HEIMDALL_OUTCOMES[outcome] ?? HEIMDALL_OUTCOMES['failed'];
    }
    const signedOut = this.route.snapshot.queryParamMap.get('signedOut');
    if (signedOut === 'heimdall') {
      // Heimdall sends the browser back here after its own sign-out (RP-initiated logout).
      this.notice =
        "You're signed out of Huginn and Heimdall. The next Continue with Heimdall asks for your password.";
    } else if (signedOut === 'heimdall-kept') {
      // Heimdall couldn't be reached, so its own session may still be there.
      this.notice =
        "You're signed out of Huginn. Heimdall may still remember you, so Continue with Heimdall can sign you straight back in.";
    }
    const email = this.route.snapshot.queryParamMap.get('email');
    if (email) {
      this.email.setValue(email);
    }
  }

  login() {
    this.submitted = true;
    this.serverError = null;
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.submitting = true;
    this.auth
      .login({ email: this.email.value, password: this.password.value })
      .then(
        () => this.router.navigate(['/private/dashboard']),
        (error: HttpErrorResponse) => (this.serverError = describeAuthError(error, 'login')),
      )
      .finally(() => (this.submitting = false));
  }

  showError(control: FormControl): boolean {
    return control.invalid && (control.touched || this.submitted);
  }

  get email(): FormControl {
    return this.getFormControl('email');
  }

  get password(): FormControl {
    return this.getFormControl('password');
  }

  getFormControl(controlName: string): FormControl {
    return this.loginForm.get(controlName) as FormControl;
  }
}
