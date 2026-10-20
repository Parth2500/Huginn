import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { IUser } from 'src/app/models/user.interface';

export interface ProfileChanges {
  username?: string;
  displayName?: string;
  bio?: string;
}

/** The signed-in user's profile, and other people's public profiles. */
@Injectable({
  providedIn: 'root',
})
export class ProfileService {
  private http = inject(HttpClient);

  private readonly me = new BehaviorSubject<IUser | null>(null);
  readonly me$ = this.me.asObservable();

  loadMe(): Observable<IUser> {
    return this.http.get<IUser>('api/users/me').pipe(tap((user) => this.me.next(user)));
  }

  updateMe(changes: ProfileChanges): Observable<IUser> {
    return this.http.patch<IUser>('api/users/me', changes).pipe(tap((user) => this.me.next(user)));
  }

  uploadAvatar(image: Blob): Observable<IUser> {
    const body = new FormData();
    body.append('avatar', image, image.type === 'image/webp' ? 'avatar.webp' : 'avatar.jpg');
    return this.http.post<IUser>('api/users/me/avatar', body).pipe(tap((user) => this.me.next(user)));
  }

  removeAvatar(): Observable<IUser> {
    return this.http.delete<IUser>('api/users/me/avatar').pipe(tap((user) => this.me.next(user)));
  }

  /** What anyone may see: photo, names, bio and join date. Never an email. */
  getProfile(userId: number): Observable<IUser> {
    return this.http.get<IUser>(`api/users/${userId}/profile`);
  }
}

/**
 * Crops the centre square of an image file and scales it to `size` pixels, as WebP where the
 * browser can encode it (JPEG otherwise). Keeps uploads small and avatars consistent.
 */
export function squareAvatar(file: File, size = 320): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      const side = Math.min(image.naturalWidth, image.naturalHeight);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const context = canvas.getContext('2d');
      if (!context || !side) {
        reject(new Error('unreadable'));
        return;
      }
      context.imageSmoothingQuality = 'high';
      context.drawImage(
        image,
        (image.naturalWidth - side) / 2,
        (image.naturalHeight - side) / 2,
        side,
        side,
        0,
        0,
        size,
        size
      );
      canvas.toBlob(
        (webp) => {
          if (webp && webp.type === 'image/webp') {
            resolve(webp);
            return;
          }
          canvas.toBlob((jpeg) => (jpeg ? resolve(jpeg) : reject(new Error('encode'))), 'image/jpeg', 0.88);
        },
        'image/webp',
        0.86
      );
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('unreadable'));
    };
    image.src = url;
  });
}
