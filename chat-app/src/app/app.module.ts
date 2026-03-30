import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';

import { HttpClientModule } from '@angular/common/http';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

import { MatSnackBarModule } from '@angular/material/snack-bar';
import { RouterModule } from '@angular/router';

import { JwtModule } from '@auth0/angular-jwt';

const MaterialImports = [MatSnackBarModule];
export const getAccessToken = () => {
  return localStorage.getItem('access_token');
};

@NgModule({
  declarations: [AppComponent],
  imports: [
    RouterModule.forRoot([]),
    BrowserModule,
    BrowserAnimationsModule,
    AppRoutingModule,
    HttpClientModule,
    JwtModule.forRoot({
      config: {
        tokenGetter: getAccessToken,
        allowedDomains: ['chat-api:3000'],
      },
    }),
    ...MaterialImports,
  ],
  providers: [],
  bootstrap: [AppComponent],
})
export class AppModule {}
