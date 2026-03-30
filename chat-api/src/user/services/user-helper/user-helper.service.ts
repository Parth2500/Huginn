import { Injectable } from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { CreateUserDto } from 'src/user/dto/create-user.dto';
import { LoginUserDto } from 'src/user/dto/login-user.dto';
import { IUser } from 'src/user/entities/user.interface';
import { IUserHelperService } from '../iservices/user-helper.service.interface';

@Injectable()
export class UserHelperService implements IUserHelperService {
  createUserDtoToEntity(createUserDto: CreateUserDto): Observable<IUser> {
    return of({
      email: createUserDto.email,
      username: createUserDto.username,
      password: createUserDto.password,
    });
  }

  loginUserDtoToEntity(loginUserDto: LoginUserDto): Observable<IUser> {
    return of({
      email: loginUserDto.email,
      password: loginUserDto.password,
    });
  }
}
