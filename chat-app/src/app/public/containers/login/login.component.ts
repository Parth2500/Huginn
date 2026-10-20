import { HttpErrorResponse } from '@angular/common/http';
import { Component, Inject, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { JwtHelperService } from '@auth0/angular-jwt';
import { finalize } from 'rxjs';
import {
  ISignOnService,
  SignOnToken,
} from '../../services/iservices/sign-on.service.interface';
import { describeAuthError } from '../../services/sign-on.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent implements OnInit {
  formBuilder: FormBuilder = new FormBuilder();
  loginForm: FormGroup = this.formBuilder.group({
    email: [null, [Validators.required, Validators.email]],
    password: [null, [Validators.required]],
  });

  submitting = false;
  submitted = false;
  serverError: string | null = null;
  showPassword = false;

  constructor(
    @Inject(SignOnToken) private signOnService: ISignOnService,
    private router: Router,
    private route: ActivatedRoute,
    private jwtService: JwtHelperService
  ) {}

  ngOnInit(): void {
    // Already signed in (another tab, or a refresh): go straight to the app instead of signing out.
    const token = localStorage.getItem('access_token');
    if (token && !this.jwtService.isTokenExpired(token)) {
      this.router.navigate(['/private/dashboard']);
      return;
    }
    if (token) {
      this.signOnService.logoutUser();
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
    this.signOnService
      .loginUser({
        email: this.email.value,
        password: this.password.value,
      })
      .pipe(finalize(() => (this.submitting = false)))
      .subscribe({
        next: () => this.router.navigate(['/private/dashboard']),
        error: (error: HttpErrorResponse) =>
          (this.serverError = describeAuthError(error, 'login')),
      });
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
