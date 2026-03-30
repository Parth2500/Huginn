import { Component, Inject, OnInit } from '@angular/core';
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
import { tap } from 'rxjs';
import { PasswordStrengthValidator } from '../../helpers/validators/password-strength.validator';
import {
  ISignOnService,
  SignOnToken,
} from '../../services/iservices/sign-on.service.interface';

@Component({
  selector: 'app-register',
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss'],
})
export class RegisterComponent implements OnInit {
  formBuilder: FormBuilder = new FormBuilder();
  registrationForm: FormGroup = this.formBuilder.group({
    email: [null, [Validators.required, Validators.email]],
    username: [null, [Validators.required]],
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

  constructor(
    @Inject(SignOnToken) private signOnService: ISignOnService,
    private router: Router
  ) {}

  ngOnInit(): void {
    throw new Error('Method not implemented.');
  }

  register() {
    if (this.registrationForm.valid) {
      this.signOnService
        .createUser({
          email: this.email.value,
          username: this.username.value,
          password: this.password.value,
        })
        .pipe(
          tap(() => {
            this.router.navigate(['/public/login']);
          })
        )
        .subscribe();
    }
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

      return value !== this.password.value ? { match: false } : null;
    };
  }
}
