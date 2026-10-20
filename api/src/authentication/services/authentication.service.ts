import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { from, Observable } from 'rxjs';
import { IUser } from 'src/user/entities/user.interface';
import { IAuthenticationService } from './iservices/authentication.service.interface';

@Injectable()
export class AuthenticationService implements IAuthenticationService {
  constructor(private jwtService: JwtService) {}

  generateJwt(user: IUser): Observable<string> {
    return from(this.jwtService.signAsync({ user }));
  }

  validateJwt(jwt: string): Promise<any> {
    return this.jwtService.verifyAsync(jwt);
  }
}
