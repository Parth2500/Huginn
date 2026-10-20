import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type ToastKind = 'info' | 'success' | 'error';

export interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

@Injectable({
  providedIn: 'root',
})
export class ToastService {
  private nextId = 1;
  private readonly toastsSubject = new BehaviorSubject<Toast[]>([]);
  readonly toasts$ = this.toastsSubject.asObservable();

  show(text: string, kind: ToastKind = 'info', duration = 4000) {
    const toast: Toast = { id: this.nextId++, kind, text };
    this.toastsSubject.next([...this.toastsSubject.value, toast].slice(-3));
    setTimeout(() => this.dismiss(toast.id), duration);
  }

  success(text: string) {
    this.show(text, 'success');
  }

  error(text: string) {
    this.show(text, 'error', 6000);
  }

  dismiss(id: number) {
    this.toastsSubject.next(
      this.toastsSubject.value.filter((toast) => toast.id !== id)
    );
  }
}
