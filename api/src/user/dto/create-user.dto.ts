import { IsNotEmpty, IsString } from 'class-validator';
import { LoginUserDto } from './login-user.dto';

export class CreateUserDto extends LoginUserDto {
  // Shape, length and reserved names are checked by username.policy in the service.
  @IsString()
  @IsNotEmpty()
  username: string;
}
