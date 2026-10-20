import { AfterViewInit, Component, ElementRef, input, output, viewChild, ChangeDetectionStrategy } from '@angular/core';
import { FormArray, FormControl, FormGroup, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IRoom } from 'src/app/models/room.interface';
import { IUser } from 'src/app/models/user.interface';
import { IconComponent } from '../../../shared/icon/icon.component';

import { SelectUsersComponent } from '../select-users/select-users.component';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
    selector: 'app-create-room',
    templateUrl: './create-room.component.html',
    styleUrls: ['./create-room.component.scss'],
    imports: [
    IconComponent,
    FormsModule,
    ReactiveFormsModule,
    SelectUsersComponent
],
})
export class CreateRoomComponent implements AfterViewInit {
  readonly me = input<IUser>({});
  readonly onlineIds = input<Set<number> | null>(null);
  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');
  readonly created = output<IRoom>();
  readonly cancel = output<void>();

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
    setTimeout(() => this.nameInput()?.nativeElement.focus());
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
