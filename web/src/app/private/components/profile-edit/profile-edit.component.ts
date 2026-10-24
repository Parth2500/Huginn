import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, input, output, signal, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormControl, FormGroup, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { finalize, firstValueFrom } from 'rxjs';
import { IUser } from 'src/app/models/user.interface';
import { ToastService } from 'src/app/shared/toast/toast.service';
import { normalizeUsername } from 'src/app/shared/username-policy';
import {
  usernameAvailableValidator,
  usernameShapeValidator,
} from 'src/app/shared/username.validators';
import { ProfileService, squareAvatar } from '../../services/profile.service';
import { IconComponent } from '../../../shared/icon/icon.component';
import { AvatarComponent } from '../../../shared/avatar/avatar.component';
import { NgClass } from '@angular/common';
import { DisplayNamePipe } from '../../../shared/pipes/display-name.pipe';
import { ChatService } from '../../services/chat.service';

const MAX_SOURCE_BYTES = 15 * 1024 * 1024;

/** How the person can sign in (GET api/auth/methods). */
interface SignInMethods {
  password: boolean;
  heimdall: { available: boolean; linked: boolean; email: string | null };
}

/** What `?heimdall=` means when the API's Heimdall callback sends the browser back here. */
const LINK_OUTCOMES: Record<string, { ok: boolean; text: string }> = {
  linked: { ok: true, text: 'Heimdall is linked. You can sign in with it now.' },
  'already-linked': { ok: true, text: 'Heimdall was already linked to your account.' },
  taken: { ok: false, text: 'That Heimdall account is already linked to another Huginn account.' },
  cancelled: { ok: false, text: 'Linking Heimdall was cancelled.' },
  failed: { ok: false, text: "Heimdall couldn't confirm the sign-in. Try again." },
  unavailable: { ok: false, text: "Can't reach Heimdall right now. Try again later." },
};

/** The signed-in user's own profile: photo, display name, username and bio. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'app-profile-edit',
    templateUrl: './profile-edit.component.html',
    styleUrls: ['./profile-edit.component.scss'],
    imports: [
    IconComponent,
    AvatarComponent,
    FormsModule,
    ReactiveFormsModule,
    NgClass,
    DisplayNamePipe
],
})
export class ProfileEditComponent implements OnInit {
  private profiles = inject(ProfileService);
  /** Async results (searches, uploads) arrive outside an input change or event. */
  private cdr = inject(ChangeDetectorRef);
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly methods = signal<SignInMethods | null>(null);
  readonly unlinking = signal(false);
  private readonly chatService = inject(ChatService);
  /** Read receipts (product-spec.md §5.4), shared with every device. */
  readonly readReceipts = this.chatService.readReceipts;
  readonly savingReceipts = signal(false);

  async toggleReceipts() {
    this.savingReceipts.set(true);
    const error = await this.chatService.setReadReceipts(!this.readReceipts());
    this.savingReceipts.set(false);
    if (error) {
      this.toast.error(error);
    }
  }

  readonly me = input<IUser>({});
  readonly saved = output<IUser>();
  readonly close = output<void>();

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

  ngOnInit(): void {
    void this.loadMethods();
    const outcome = LINK_OUTCOMES[this.route.snapshot.queryParamMap.get('heimdall') ?? ''];
    if (outcome) {
      if (outcome.ok) {
        this.toast.success(outcome.text);
      } else {
        this.toast.error(outcome.text);
      }
      // Drop the query, so a reload doesn't repeat the message.
      void this.router.navigate([], { queryParams: { heimdall: null }, queryParamsHandling: 'merge', replaceUrl: true });
    }
    this.profiles.loadMe().subscribe({
      next: (profile) => {
        this.reset(profile);
        this.cdr.markForCheck();
      },
      error: () => {
        this.serverError = "Couldn't load your profile. Check your connection and try again.";
        this.cdr.markForCheck();
      },
    });
  }

  async unlinkHeimdall() {
    this.unlinking.set(true);
    try {
      await firstValueFrom(this.http.delete('api/auth/heimdall/link'));
      this.toast.show('Heimdall is unlinked. Sign in with your password from now on.');
      await this.loadMethods();
    } catch (error) {
      const message = (error as HttpErrorResponse).error?.message;
      this.toast.error(typeof message === 'string' ? message : "Couldn't unlink Heimdall. Try again.");
    } finally {
      this.unlinking.set(false);
    }
  }

  private async loadMethods() {
    try {
      this.methods.set(await firstValueFrom(this.http.get<SignInMethods>('api/auth/methods')));
    } catch {
      // The section just doesn't show; the rest of the profile still works.
    }
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
      ...(this.profile ?? this.me()),
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
        .pipe(finalize(() => this.done(() => (this.uploading = false))))
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
      this.done(() => (this.uploading = false));
      this.toast.error("That image couldn't be read. Try a JPEG, PNG or WebP file.");
    }
  }

  removePhoto() {
    this.uploading = true;
    this.profiles
      .removeAvatar()
      .pipe(finalize(() => this.done(() => (this.uploading = false))))
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
      .pipe(finalize(() => this.done(() => (this.saving = false))))
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

  /** Ends a request: clears its busy flag and repaints (results arrive outside any event). */
  private done(clear: () => void) {
    clear();
    this.cdr.markForCheck();
  }
}
