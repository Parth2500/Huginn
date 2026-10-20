import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { IUser } from 'src/app/models/user.interface';
import { ToastService } from 'src/app/shared/toast/toast.service';
import { normalizeUsername } from 'src/app/shared/username-policy';
import {
  usernameAvailableValidator,
  usernameShapeValidator,
} from 'src/app/shared/username.validators';
import { ProfileService, squareAvatar } from '../../services/profile.service';

const MAX_SOURCE_BYTES = 15 * 1024 * 1024;

/** The signed-in user's own profile: photo, display name, username and bio. */
@Component({
  selector: 'app-profile-edit',
  templateUrl: './profile-edit.component.html',
  styleUrls: ['./profile-edit.component.scss'],
})
export class ProfileEditComponent implements OnInit {
  @Input() me: IUser = {};
  @Output() saved = new EventEmitter<IUser>();
  @Output() close = new EventEmitter<void>();

  profile: IUser | null = null;
  saving = false;
  uploading = false;
  submitted = false;
  serverError: string | null = null;

  form = new FormGroup({
    displayName: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(40)] }),
    username: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, usernameShapeValidator()],
      asyncValidators: [usernameAvailableValidator(this.http, () => this.profile?.username)],
    }),
    bio: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(160)] }),
  });

  constructor(
    private profiles: ProfileService,
    private http: HttpClient,
    private toast: ToastService
  ) {}

  ngOnInit(): void {
    this.profiles.loadMe().subscribe({
      next: (profile) => this.reset(profile),
      error: () => (this.serverError = "Couldn't load your profile. Check your connection and try again."),
    });
  }

  get username(): FormControl<string> {
    return this.form.controls.username;
  }

  get bio(): FormControl<string> {
    return this.form.controls.bio;
  }

  get displayName(): FormControl<string> {
    return this.form.controls.displayName;
  }

  /** The profile as it would look with the current edits: for the live preview. */
  get preview(): IUser {
    return {
      ...(this.profile ?? this.me),
      displayName: this.displayName.value.trim() || null,
      // Only a username that would be accepted shows in the preview.
      username: this.username.valid ? normalizeUsername(this.username.value) : this.profile?.username,
    };
  }

  get usernameMessage(): { kind: 'error' | 'ok' | 'hint' | 'checking'; text: string } {
    const control = this.username;
    const unchanged = normalizeUsername(control.value).toLowerCase() === this.profile?.username?.toLowerCase();
    if (control.hasError('required') && (control.touched || this.submitted)) {
      return { kind: 'error', text: 'Choose a username.' };
    }
    if (control.hasError('username')) {
      return { kind: 'error', text: control.getError('username') };
    }
    if (control.pending) {
      return { kind: 'checking', text: 'Checking…' };
    }
    if (control.hasError('usernameTaken')) {
      return { kind: 'error', text: control.getError('usernameTaken') };
    }
    if (!unchanged && control.valid) {
      return { kind: 'ok', text: `@${normalizeUsername(control.value)} is available.` };
    }
    return { kind: 'hint', text: '3–24 characters. Start with a letter; letters, numbers, . and _.' };
  }

  async onPhotoChosen(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    if (!file.type.startsWith('image/') || file.size > MAX_SOURCE_BYTES) {
      this.toast.error('Choose an image file (JPEG, PNG or WebP) under 15 MB.');
      return;
    }
    this.uploading = true;
    try {
      const image = await squareAvatar(file);
      this.profiles
        .uploadAvatar(image)
        .pipe(finalize(() => (this.uploading = false)))
        .subscribe({
          next: (profile) => {
            this.profile = profile;
            this.saved.emit(profile);
            this.toast.success('Profile photo updated.');
          },
          error: (error: HttpErrorResponse) =>
            this.toast.error(error.error?.message ?? "Couldn't upload that photo. Try another one."),
        });
    } catch {
      this.uploading = false;
      this.toast.error("That image couldn't be read. Try a JPEG, PNG or WebP file.");
    }
  }

  removePhoto() {
    this.uploading = true;
    this.profiles
      .removeAvatar()
      .pipe(finalize(() => (this.uploading = false)))
      .subscribe({
        next: (profile) => {
          this.profile = profile;
          this.saved.emit(profile);
          this.toast.show('Profile photo removed.');
        },
        error: () => this.toast.error("Couldn't remove the photo. Try again."),
      });
  }

  save() {
    this.submitted = true;
    this.serverError = null;
    if (this.form.invalid || this.form.pending || !this.profile) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const changes: { username?: string; displayName?: string; bio?: string } = {};
    if (normalizeUsername(value.username) !== this.profile.username) {
      changes.username = normalizeUsername(value.username);
    }
    if (value.displayName.trim() !== (this.profile.displayName ?? '')) {
      changes.displayName = value.displayName;
    }
    if (value.bio.trim() !== (this.profile.bio ?? '')) {
      changes.bio = value.bio;
    }
    if (Object.keys(changes).length === 0) {
      this.close.emit();
      return;
    }
    this.saving = true;
    this.profiles
      .updateMe(changes)
      .pipe(finalize(() => (this.saving = false)))
      .subscribe({
        next: (profile) => {
          this.reset(profile);
          this.saved.emit(profile);
          this.toast.success('Profile saved.');
        },
        error: (error: HttpErrorResponse) => {
          const message = error.error?.message;
          this.serverError = Array.isArray(message)
            ? message[0]
            : typeof message === 'string'
            ? message
            : "Couldn't save your profile. Try again.";
        },
      });
  }

  private reset(profile: IUser) {
    this.profile = profile;
    this.form.reset({
      displayName: profile.displayName ?? '',
      username: profile.username ?? '',
      bio: profile.bio ?? '',
    });
    this.submitted = false;
  }
}
