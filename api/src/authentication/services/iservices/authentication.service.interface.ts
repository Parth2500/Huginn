import { Observable } from 'rxjs';
import { IUser } from 'src/user/entities/user.interface';

export interface IAuthenticationService {
  generateJwt(user: IUser): Observable<string>;
  validateJwt(jwt: string): Promise<any>;
}

export const AuthenticationToken = 'IAuthenticationService';
