import { Injectable } from '@nestjs/common';
import { from, Observable } from 'rxjs';
import * as bcrypt from 'bcryptjs';
import { IPasswordService } from './iservices/password.service.interface';

@Injectable()
export class PasswordService implements IPasswordService {
  hashPassword(password: string): Observable<string> {
    return from<Promise<string>>(bcrypt.hash(password, 12));
  }

  validatePassword(
    password: string,
    storedPassword: string,
  ): Observable<boolean> {
    return from<Promise<boolean>>(bcrypt.compare(password, storedPassword));
  }
}
