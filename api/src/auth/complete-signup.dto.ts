import { IsOptional, IsString, MaxLength } from 'class-validator';

/** The welcome step after a first sign-in through Heimdall. */
export class CompleteSignupDto {
  @IsString()
  @MaxLength(64)
  username: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  displayName?: string;
}
