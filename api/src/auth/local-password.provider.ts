import { Inject, Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { CreateUserDto } from 'src/user/dto/create-user.dto';
import { IUser } from 'src/user/entities/user.interface';
import {
  IUserService,
  UserToken,
} from 'src/user/services/iservices/user.service.interface';
import {
  AuthProvider,
  SignInError,
  SignInRequest,
  SignInStep,
} from './auth-provider';
import { IPasswordService, PasswordToken } from './password.service.interface';

/** Compared against when no account matches, so a wrong email takes as long as a wrong password. */
const NO_ACCOUNT_HASH =
  '$2b$12$hqnJoP4XYiVEn7EtIngY6.aUeaOatkdqHZ3ECrVDeORMu0LTAt2Oi';

/** Email and password accounts stored by Huginn: today's sign-in, until Heimdall takes over. */
@Injectable()
export class LocalPasswordProvider implements AuthProvider {
  readonly name = 'local';

  constructor(
    @Inject(UserToken) private readonly userService: IUserService,
    @Inject(PasswordToken) private readonly passwords: IPasswordService,
  ) {}

  async signIn({ email, password }: SignInRequest): Promise<SignInStep> {
    const found = email
      ? await firstValueFrom(
          this.userService.findByEmailForLogin(email.trim().toLowerCase()),
        )
      : null;
    const match = await firstValueFrom(
      this.passwords.validatePassword(
        password ?? '',
        found?.password ?? NO_ACCOUNT_HASH,
      ),
    );
    // One answer for an unknown email and a wrong password, so sign-in can't be used to find
    // out who has an account.
    if (!found || !match) {
      throw new SignInError(
        "That email and password don't match. Check them and try again.",
      );
    }
    return { kind: 'signed-in', user: found };
  }

  async register(dto: CreateUserDto): Promise<IUser> {
    const password = await firstValueFrom(
      this.passwords.hashPassword(dto.password),
    );
    return firstValueFrom(
      this.userService.create({
        email: dto.email,
        username: dto.username,
        password,
      }),
    );
  }
}
