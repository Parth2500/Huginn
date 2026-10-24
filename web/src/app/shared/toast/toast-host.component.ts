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
          class="toast" [class.error]="toast.kind === 'error'" [class.success]="toast.kind === 'success'"
          [class.has-action]="!!toast.action"
          (pointerenter)="toastService.hold(toast.id)" (pointerleave)="leave($event, toast)"
          (focusin)="toastService.hold(toast.id)" (focusout)="leave($event, toast)">
          <app-icon [name]="toast.kind === 'error' ? 'alert-circle' : 'check'" />
          <p>{{ toast.text }}</p>
          @if (toast.action; as action) {
            <button type="button" class="toast-action" (click)="toastService.act(toast)">{{ action.label }}</button>
          }
          <button type="button" class="icon-btn" (click)="toastService.dismiss(toast.id)" aria-label="Dismiss">
            <app-icon name="x" />
          </button>
          @if (toast.action) {
            <span class="countdown" [style.animation-duration.ms]="toast.duration" aria-hidden="true"></span>
          }
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

  /** The clock restarts only once neither the pointer nor the focus is on the toast. */
  leave(event: Event, toast: Toast) {
    const element = event.currentTarget as HTMLElement;
    const next = (event as FocusEvent).relatedTarget as Node | null;
    const stillFocused = event.type === 'focusout' ? element.contains(next) : element.contains(document.activeElement);
    const stillHovered = event.type === 'focusout' && element.matches(':hover');
    if (!stillFocused && !stillHovered) {
      this.toastService.release(toast.id);
    }
  }
}
