import { Routes } from '@angular/router';
import { DashboardComponent } from './containers/dashboard/dashboard.component';

export const PRIVATE_ROUTES: Routes = [
  {
    path: '',
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', component: DashboardComponent },
      // Group creation and the profile editor live inside the dashboard shell; these keep links working.
      { path: 'create-room', component: DashboardComponent, data: { create: true } },
      { path: 'profile', component: DashboardComponent, data: { profile: true } },
      { path: '**', redirectTo: 'dashboard' },
    ],
  },
];
