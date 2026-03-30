import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { LoginResponse } from 'src/app/models/login-response.interface';
import { IUser } from 'src/app/models/user.interface';

export interface ISignOnService {
  createUser(user: IUser): Observable<IUser>;
  findByUsername(username: string): Observable<IUser[]>;
  loginUser(user: IUser): Observable<LoginResponse>;
  getLoggedInUser(): IUser;
  logoutUser(): void;
}

export const SignOnToken = new InjectionToken<ISignOnService>('ISignOnService');
