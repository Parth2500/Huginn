import { Component } from '@angular/core';
import { Toast, ToastService } from './toast.service';

@Component({
  selector: 'app-toast-host',
  template: `
    <div class="toasts" role="status" aria-live="polite">
      <div *ngFor="let toast of toastService.toasts$ | async; trackBy: trackById"
        class="toast" [class.error]="toast.kind === 'error'" [class.success]="toast.kind === 'success'">
        <app-icon [name]="toast.kind === 'error' ? 'alert-circle' : 'check'"></app-icon>
        <p>{{ toast.text }}</p>
        <button type="button" class="icon-btn" (click)="toastService.dismiss(toast.id)" aria-label="Dismiss">
          <app-icon name="x"></app-icon>
        </button>
      </div>
    </div>
  `,
  styleUrls: ['./toast-host.component.scss'],
})
export class ToastHostComponent {
  constructor(public toastService: ToastService) {}

  trackById(_: number, toast: Toast) {
    return toast.id;
  }
}
