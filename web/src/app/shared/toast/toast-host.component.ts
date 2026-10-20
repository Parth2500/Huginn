import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { Toast, ToastService } from './toast.service';
import { AsyncPipe } from '@angular/common';
import { IconComponent } from '../icon/icon.component';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
    selector: 'app-toast-host',
    template: `
    <div class="toasts" role="status" aria-live="polite">
      @for (toast of toastService.toasts$ | async; track trackById($index, toast)) {
        <div
          class="toast" [class.error]="toast.kind === 'error'" [class.success]="toast.kind === 'success'">
          <app-icon [name]="toast.kind === 'error' ? 'alert-circle' : 'check'" />
          <p>{{ toast.text }}</p>
          <button type="button" class="icon-btn" (click)="toastService.dismiss(toast.id)" aria-label="Dismiss">
            <app-icon name="x" />
          </button>
        </div>
      }
    </div>
    `,
    styleUrls: ['./toast-host.component.scss'],
    imports: [
    IconComponent,
    AsyncPipe
],
})
export class ToastHostComponent {
  toastService = inject(ToastService);


  trackById(_: number, toast: Toast) {
    return toast.id;
  }
}
