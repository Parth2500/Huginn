import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'public', pathMatch: 'full' },
  {
    path: 'public',
    loadChildren: () => import('./public/public.routes').then((m) => m.PUBLIC_ROUTES),
  },
  {
    path: 'private',
    canActivate: [authGuard],
    loadChildren: () => import('./private/private.routes').then((m) => m.PRIVATE_ROUTES),
  },
  { path: '**', redirectTo: 'public' },
];
