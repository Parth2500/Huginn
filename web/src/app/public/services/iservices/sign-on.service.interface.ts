import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { IUser } from 'src/app/models/user.interface';

export interface ISignOnService {
  createUser(user: IUser): Observable<IUser>;
  findByUsername(username: string): Observable<IUser | null>;
  searchUsers(query: string): Observable<IUser[]>;
}

export const SignOnToken = new InjectionToken<ISignOnService>('ISignOnService');
