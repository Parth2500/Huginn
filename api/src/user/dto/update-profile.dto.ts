import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Fields a user may change on their own profile. Username rules live in username.policy. */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  bio?: string;
}
