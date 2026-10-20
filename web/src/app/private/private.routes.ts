import { Routes } from '@angular/router';
import { DashboardComponent } from './containers/dashboard/dashboard.component';
import { ChatService } from './services/chat.service';
import { ChatToken } from './services/iservices/chat.service.interface';

export const PRIVATE_ROUTES: Routes = [
  {
    path: '',
    providers: [{ provide: ChatToken, useExisting: ChatService }],
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
