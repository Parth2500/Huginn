import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { RequestModel } from 'src/middleware/auth.middleware';
import { CreateUserDto } from 'src/user/dto/create-user.dto';
import { LoginUserDto } from 'src/user/dto/login-user.dto';
import {
  IUserService,
  UserToken,
} from 'src/user/services/iservices/user.service.interface';
import {
  AUTH_PROVIDER,
  AuthProvider,
  SignInError,
  SignInStep,
} from './auth-provider';
import { LocalPasswordProvider } from './local-password.provider';
import {
  readSessionToken,
  sessionCookieName,
  sessionCookieOptions,
} from './session-cookie';
import { SessionsService } from './sessions.service';

/** Signing in and out. The session lives in an httpOnly cookie; the app never sees a token. */
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AUTH_PROVIDER) private readonly provider: AuthProvider,
    private readonly local: LocalPasswordProvider,
    private readonly sessions: SessionsService,
    @Inject(UserToken) private readonly userService: IUserService,
  ) {}

  /** Local accounts only: with Heimdall, accounts are created there. */
  @Post('register')
  register(@Body() dto: CreateUserDto) {
    return this.local.register(dto);
  }

  /** Starts a session and answers with the signed-in person's own profile. */
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() credentials: LoginUserDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    let step: SignInStep;
    try {
      step = await this.provider.signIn(credentials);
    } catch (error) {
      if (error instanceof SignInError) {
        throw new UnauthorizedException(error.message);
      }
      throw error;
    }
    if (step.kind !== 'signed-in') {
      // Redirecting providers sign in through their own routes (architecture.md §2.2).
      throw new UnauthorizedException(
        'Sign in through your identity provider.',
      );
    }
    const { token } = await this.sessions.create(
      step.user.Id,
      this.provider.name,
      {
        userAgent: req.headers['user-agent'],
        providerData: step.providerData,
      },
    );
    res.cookie(sessionCookieName(), token, sessionCookieOptions());
    return this.userService.getOwnProfile(step.user.Id);
  }

  /** Who is signed in. 401 means nobody, so the app shows the sign-in page. */
  @Get('session')
  session(@Req() req: RequestModel) {
    return this.userService.getOwnProfile(req.user.Id);
  }

  /** Always succeeds and always clears the cookie, even if the session had already ended. */
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const resolved = await this.sessions.resolve(
      readSessionToken(req.headers.cookie),
    );
    if (resolved) {
      await this.provider.signOut?.(resolved.session);
      await this.sessions.revoke(resolved.session);
    }
    const { httpOnly, secure, sameSite, path } = sessionCookieOptions();
    res.clearCookie(sessionCookieName(), { httpOnly, secure, sameSite, path });
  }
}
