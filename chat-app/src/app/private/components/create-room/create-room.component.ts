import { AfterViewInit, Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { FormArray, FormControl, FormGroup, Validators } from '@angular/forms';
import { IRoom } from 'src/app/models/room.interface';
import { IUser } from 'src/app/models/user.interface';

@Component({
  selector: 'app-create-room',
  templateUrl: './create-room.component.html',
  styleUrls: ['./create-room.component.scss'],
})
export class CreateRoomComponent implements AfterViewInit {
  @Input() me: IUser = {};
  @Input() onlineIds: Set<number> | null = null;
  @ViewChild('nameInput') private nameInput: ElementRef<HTMLInputElement>;
  @Output() created = new EventEmitter<IRoom>();
  @Output() cancel = new EventEmitter<void>();

  form: FormGroup = new FormGroup({
    name: new FormControl<string | null>(null, [Validators.required, Validators.maxLength(60)]),
    description: new FormControl<string | null>(null, [Validators.maxLength(140)]),
    // Groups are for three or more; one other person is a direct chat.
    users: new FormArray<FormControl<IUser>>([], [Validators.required, Validators.minLength(2)]),
  });

  submitted = false;
  /** True while the picker is looking up or offering a person, so the empty-people error waits. */
  peoplePending = false;

  ngAfterViewInit() {
    setTimeout(() => this.nameInput?.nativeElement.focus());
  }

  create() {
    this.submitted = true;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.created.emit({
      name: this.name.value.trim(),
      description: this.description.value?.trim() || undefined,
      users: this.users.value,
    });
  }

  addUser(user: IUser) {
    if (this.users.value.some((u: IUser) => u.Id === user.Id)) {
      return;
    }
    this.users.push(
      new FormControl<IUser>({ Id: user.Id, username: user.username }, { nonNullable: true })
    );
  }

  removeUser(user: IUser) {
    const index = this.users.value.findIndex((u: IUser) => u.Id === user.Id);
    if (index > -1) {
      this.users.removeAt(index);
    }
  }

  showError(control: FormControl | FormArray): boolean {
    // The people list has no blur of its own, so it only complains after a submit.
    const engaged = control instanceof FormArray ? this.submitted : control.touched || this.submitted;
    return control.invalid && engaged;
  }

  get name(): FormControl {
    return this.form.get('name') as FormControl;
  }

  get description(): FormControl {
    return this.form.get('description') as FormControl;
  }

  get users(): FormArray {
    return this.form.get('users') as FormArray;
  }
}
