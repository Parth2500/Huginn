import { Component, Inject } from '@angular/core';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { tap } from 'rxjs';
import {
  ISignOnService,
  SignOnToken,
} from '../../services/iservices/sign-on.service.interface';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent {
  formBuilder: FormBuilder = new FormBuilder();
  loginForm: FormGroup = this.formBuilder.group({
    email: [null, [Validators.required, Validators.email]],
    password: [null, [Validators.required]],
  });

  constructor(
    @Inject(SignOnToken) private signOnService: ISignOnService,
    private router: Router
  ) {}

  ngOnInit(): void {
    if (localStorage.getItem('access_token')) {
      this.signOnService.logoutUser();
    }
  }

  login() {
    if (this.loginForm.valid) {
      this.signOnService
        .loginUser({
          email: this.email.value,
          password: this.password.value,
        })
        .pipe(
          tap(() => {
            this.router.navigate(['/private/dashboard']);
          })
        )
        .subscribe();
    }
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
