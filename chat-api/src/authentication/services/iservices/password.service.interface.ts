import { Observable } from 'rxjs';

export interface IPasswordService {
  hashPassword(password: string): Observable<string>;
  validatePassword(
    password: string,
    storedPassword: string,
  ): Observable<boolean>;
}
export const PasswordToken = 'IPasswordService';
