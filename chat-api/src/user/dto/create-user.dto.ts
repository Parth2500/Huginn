import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import { LoginUserDto } from './login-user.dto';

export class CreateUserDto extends LoginUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(24)
  @Matches(/^[A-Za-z0-9._-]+$/, {
    message: 'Usernames can use letters, numbers, dots, dashes and underscores.',
  })
  username: string;
}
