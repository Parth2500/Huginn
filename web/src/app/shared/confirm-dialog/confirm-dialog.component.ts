import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';

/**
 * A confirmation for a destructive or blocking choice (ux-design.md §8): a title, one sentence
 * of consequence, then Cancel and the action on the right. It's a native modal `<dialog>`, so
 * focus stays inside and Esc means Cancel. Cancel has focus first, so Enter never destroys.
 */
@Component({
  selector: 'app-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog aria-labelledby="confirm-title" aria-describedby="confirm-body"
      (cancel)="$event.preventDefault(); cancel.emit()" (click)="onBackdrop($event)">
      <h2 id="confirm-title">{{ title() }}</h2>
      <p id="confirm-body">{{ body() }}</p>
      <ng-content />
      <div class="actions">
        <button type="button" class="btn btn-secondary" (click)="cancel.emit()" autofocus>Cancel</button>
        <button type="button" class="btn" [class.btn-danger]="danger()" [class.btn-primary]="!danger()"
          (click)="confirm.emit()">{{ action() }}</button>
      </div>
    </dialog>
  `,
  styleUrls: ['./confirm-dialog.component.scss'],
})
export class ConfirmDialogComponent implements AfterViewInit {
  readonly title = input.required<string>();
  readonly body = input.required<string>();
  /** The action's name, a plain verb: "Delete chat". */
  readonly action = input.required<string>();
  readonly danger = input(true);
  readonly confirm = output<void>();
  readonly cancel = output<void>();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  ngAfterViewInit() {
    this.dialog().nativeElement.showModal();
  }

  /** A click on the dim area outside the panel cancels. */
  onBackdrop(event: MouseEvent) {
    if (event.target === this.dialog().nativeElement) {
      this.cancel.emit();
    }
  }
}
