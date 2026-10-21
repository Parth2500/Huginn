import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { sessionInterceptor } from './core/session.interceptor';
import { SignOnService } from './public/services/sign-on.service';
import { SignOnToken } from './public/services/iservices/sign-on.service.interface';

export const appConfig: ApplicationConfig = {
  providers: [
    // Components still rely on zone-based change detection; moving to zoneless follows the signals work.
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([sessionInterceptor])),
    { provide: SignOnToken, useExisting: SignOnService },
  ],
};
