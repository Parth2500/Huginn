import { Observable } from 'rxjs';
import { CreateUserDto } from 'src/user/dto/create-user.dto';
import { LoginUserDto } from 'src/user/dto/login-user.dto';
import { IUser } from 'src/user/entities/user.interface';

export interface IUserHelperService {
  createUserDtoToEntity(createUserDto: CreateUserDto): Observable<IUser>;
  loginUserDtoToEntity(loginUserDto: LoginUserDto): Observable<IUser>;
}

export const UserHelperToken = 'UserHelperService';
