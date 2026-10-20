import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';

import { HttpClientModule } from '@angular/common/http';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

import { RouterModule } from '@angular/router';

import { JwtModule } from '@auth0/angular-jwt';
import { SharedModule } from './shared/shared.module';

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
    SharedModule,
  ],
  providers: [],
  bootstrap: [AppComponent],
})
export class AppModule {}
