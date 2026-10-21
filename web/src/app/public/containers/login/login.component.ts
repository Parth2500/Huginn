import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from 'src/app/core/auth.service';
import { describeAuthError } from '../../services/sign-on.service';
import { AuthLayoutComponent } from '../../components/auth-layout/auth-layout.component';

import { IconComponent } from '../../../shared/icon/icon.component';

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

  ngOnInit(): void {
    // Already signed in (another tab, or a refresh): go straight to the app.
    void this.auth.check().then((me) => {
      if (me) {
        void this.router.navigate(['/private/dashboard']);
      }
    });
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
