import { Routes } from '@angular/router';
import { LoginComponent } from './containers/login/login.component';
import { RegisterComponent } from './containers/register/register.component';
import { WelcomeComponent } from './containers/welcome/welcome.component';

export const PUBLIC_ROUTES: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent, title: 'Sign in · Huginn' },
  { path: 'register', component: RegisterComponent, title: 'Create account · Huginn' },
  { path: 'welcome', component: WelcomeComponent, title: 'Choose your username · Huginn' },
  { path: '**', redirectTo: 'login' },
];
