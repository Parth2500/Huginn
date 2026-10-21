import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom, Subject } from 'rxjs';
import { IUser } from 'src/app/models/user.interface';

/** Remembered so the app can open from the device's copy when the server can't be reached. */
const LAST_USER_KEY = 'huginn.lastUser';

/** The server didn't answer (it's down, or the network is), as opposed to saying no. */
export const isUnreachable = (error: unknown) =>
  error instanceof HttpErrorResponse && [0, 502, 503, 504].includes(error.status);

/**
 * Who is signed in. The session itself is an httpOnly cookie the app can't read
 * (docs/huginn/architecture.md §2.3), so this asks the server, and remembers only the answer.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  readonly me = signal<IUser | null>(null);
  /** The server turned away a request mid-session: the session expired or was revoked. */
  readonly ended = new Subject<string>();
  private checked: Promise<IUser | null> | null = null;

  /** The signed-in person, asked of the server once per page load. */
  check(): Promise<IUser | null> {
    this.checked ??= firstValueFrom(this.http.get<IUser>('api/auth/session')).then(
      (user) => this.signedIn(user),
      (error: unknown) => {
        if (isUnreachable(error)) {
          // Offline: open with the device's copy; the socket checks the session when it connects.
          const last = readLastUser();
          this.me.set(last);
          this.checked = null;
          return last;
        }
        this.signedOut();
        return null;
      },
    );
    return this.checked;
  }

  async login(credentials: { email: string; password: string }): Promise<IUser> {
    const user = await firstValueFrom(this.http.post<IUser>('api/auth/login', credentials));
    this.checked = Promise.resolve(this.signedIn(user));
    return user;
  }

  /** Ends the session on the server (and every socket using it), then forgets it here. */
  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post('api/auth/logout', {}));
    } catch {
      // Offline: the cookie stays until the session expires, but this device forgets it now.
    }
    this.signedOut();
  }

  /** Called when the server says the session is gone. */
  expire(message: string) {
    if (this.me()) {
      this.signedOut();
      this.ended.next(message);
    }
  }

  private signedIn(user: IUser): IUser {
    this.me.set(user);
    try {
      const { Id, username, displayName, avatarUrl } = user;
      localStorage.setItem(LAST_USER_KEY, JSON.stringify({ Id, username, displayName, avatarUrl }));
    } catch {
      // Storage blocked: offline start just isn't available.
    }
    return user;
  }

  private signedOut() {
    this.me.set(null);
    this.checked = Promise.resolve(null);
    try {
      localStorage.removeItem(LAST_USER_KEY);
    } catch {
      // Nothing stored.
    }
  }
}

function readLastUser(): IUser | null {
  try {
    const raw = localStorage.getItem(LAST_USER_KEY);
    return raw ? (JSON.parse(raw) as IUser) : null;
  } catch {
    return null;
  }
}
