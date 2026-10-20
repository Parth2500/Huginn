import { ApplicationConfig, importProvidersFrom, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { JwtModule } from '@auth0/angular-jwt';
import { routes } from './app.routes';
import { getAccessToken } from './core/access-token';
import { SignOnService } from './public/services/sign-on.service';
import { SignOnToken } from './public/services/iservices/sign-on.service.interface';

export const appConfig: ApplicationConfig = {
  providers: [
    // Components still rely on zone-based change detection; moving to zoneless follows the signals work.
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptorsFromDi()),
    importProvidersFrom(JwtModule.forRoot({ config: { tokenGetter: getAccessToken } })),
    { provide: SignOnToken, useExisting: SignOnService },
  ],
};
