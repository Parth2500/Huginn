import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type ToastKind = 'info' | 'success' | 'error';

/** A button on the toast, such as Undo. Running it dismisses the toast. */
export interface ToastAction {
  label: string;
  run: () => void;
}

export interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
  action?: ToastAction;
  /** How long it stays, in ms; the Undo countdown draws this. */
  duration: number;
}

/** How long an Undo stays on offer (ux-design.md §8). */
export const UNDO_MS = 5000;

@Injectable({
  providedIn: 'root',
})
export class ToastService {
  private nextId = 1;
  private readonly toastsSubject = new BehaviorSubject<Toast[]>([]);
  readonly toasts$ = this.toastsSubject.asObservable();
  /** Each toast's timer, and when it ends, so hovering or focusing it can pause it. */
  private readonly timers = new Map<
    number,
    { handle: ReturnType<typeof setTimeout>; endsAt: number; left: number; held: boolean }
  >();

  show(text: string, kind: ToastKind = 'info', duration = 4000, action?: ToastAction) {
    const toast: Toast = { id: this.nextId++, kind, text, action, duration };
    const kept = [...this.toastsSubject.value, toast];
    // Three at most: the oldest go first.
    kept.slice(0, -3).forEach((old) => this.clearTimer(old.id));
    this.toastsSubject.next(kept.slice(-3));
    this.startTimer(toast.id, duration);
  }

  success(text: string) {
    this.show(text, 'success');
  }

  error(text: string) {
    this.show(text, 'error', 6000);
  }

  /** "Chat archived. [Undo]" */
  undoable(text: string, undo: () => void) {
    this.show(text, 'success', UNDO_MS, { label: 'Undo', run: undo });
  }

  act(toast: Toast) {
    this.dismiss(toast.id);
    toast.action?.run();
  }

  /** The pointer or keyboard is on the toast: stop its clock. */
  hold(id: number) {
    const timer = this.timers.get(id);
    if (timer && !timer.held) {
      clearTimeout(timer.handle);
      timer.left = Math.max(0, timer.endsAt - Date.now());
      timer.held = true;
    }
  }

  release(id: number) {
    const timer = this.timers.get(id);
    if (timer?.held) {
      this.startTimer(id, timer.left);
    }
  }

  dismiss(id: number) {
    this.clearTimer(id);
    this.toastsSubject.next(
      this.toastsSubject.value.filter((toast) => toast.id !== id)
    );
  }

  private startTimer(id: number, ms: number) {
    this.clearTimer(id);
    this.timers.set(id, { handle: setTimeout(() => this.dismiss(id), ms), endsAt: Date.now() + ms, left: ms, held: false });
  }

  private clearTimer(id: number) {
    clearTimeout(this.timers.get(id)?.handle);
    this.timers.delete(id);
  }
}
