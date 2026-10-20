import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { PublicRoutingModule } from './public-routing.module';
import { LoginComponent } from './containers/login/login.component';
import { RegisterComponent } from './containers/register/register.component';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { SignOnService } from './services/sign-on.service';
import { SignOnToken } from './services/iservices/sign-on.service.interface';
import { SharedModule } from '../shared/shared.module';
import { AuthLayoutComponent } from './components/auth-layout/auth-layout.component';

@NgModule({
  declarations: [LoginComponent, RegisterComponent, AuthLayoutComponent],
  imports: [
    CommonModule,
    PublicRoutingModule,
    FormsModule,
    ReactiveFormsModule,
    SharedModule,
  ],
  providers: [{ provide: SignOnToken, useClass: SignOnService }],
})
export class PublicModule {}
