import {
  BadRequestException,
  Body,
  Controller,
  Header,
  Delete,
  Get,
  HttpCode,
  Inject,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  NotFoundException,
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
  AuthProvider,
  ExternalIdentity,
  ProviderSession,
  SignInError,
  SignInStep,
} from './auth-provider';
import { CompleteSignupDto } from './complete-signup.dto';
import {
  HeimdallOidcProvider,
  heimdallSettings,
} from './heimdall-oidc.provider';
import { IdentitiesService, SIGNUP_TTL_MS } from './identities.service';
import { LocalPasswordProvider } from './local-password.provider';
import {
  clearCookieOptions,
  cookieName,
  cookieOptions,
  readCookie,
  readSessionToken,
  sessionCookieName,
  sessionCookieOptions,
} from './session-cookie';
import { SessionsService } from './sessions.service';

/** Long enough to type a password at Heimdall, short enough that a stale one is useless. */
const OIDC_TRANSACTION_MS = 10 * 60 * 1000;
const transactionCookie = () => cookieName('huginn_oidc');
const signupCookie = () => cookieName('huginn_signup');

/** Where the browser lands after Heimdall. The app shows a message for each `heimdall` code. */
const AFTER = {
  signedIn: '/private/dashboard',
  signup: '/public/welcome',
  failed: (code: string) => `/public/login?heimdall=${code}`,
  linked: (code: string) => `/private/profile?heimdall=${code}`,
};

/** Signing in and out. The session lives in an httpOnly cookie; the app never sees a token. */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly local: LocalPasswordProvider,
    private readonly heimdall: HeimdallOidcProvider,
    private readonly identities: IdentitiesService,
    private readonly sessions: SessionsService,
    @Inject(UserToken) private readonly userService: IUserService,
  ) {}

  /** Which sign-in methods this server offers, for the sign-in page. */
  @Get('providers')
  providers() {
    return { password: true, heimdall: this.heimdall.enabled };
  }

  /** Local accounts only: with Heimdall, accounts start at Heimdall (see signup below). */
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
    const user = await this.signInOrRefuse(this.local, credentials);
    await this.startSession(user.Id, this.local.name, req, res);
    return this.userService.getOwnProfile(user.Id);
  }

  /** Who is signed in. 401 means nobody, so the app shows the sign-in page. */
  @Get('session')
  session(@Req() req: RequestModel) {
    return this.userService.getOwnProfile(req.user.Id);
  }

  /**
   * Always succeeds and always clears the cookie, even if the session had already ended. Answers
   * with the provider that signed the session in, and for Heimdall, its end_session_endpoint with
   * this sign-in's ID token (RP-initiated logout). The app sends the browser there, so Heimdall
   * ends its own session too.
   */
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const resolved = await this.sessions.resolve(
      readSessionToken(req.headers.cookie),
    );
    let redirectTo: string | null = null;
    if (resolved?.session.provider === this.heimdall.name) {
      redirectTo = await this.heimdall.signOutUrl(resolved.session);
    }
    if (resolved) {
      await this.sessions.revoke(resolved.session);
    }
    res.clearCookie(sessionCookieName(), clearCookieOptions());
    return { provider: resolved?.session.provider ?? null, redirectTo };
  }

  /**
   * Back-Channel Logout 1.0: Heimdall's server says that a Heimdall session ended. Huginn ends
   * every session that it started. The token is the only proof, so it is checked in full first.
   */
  @Post('heimdall/backchannel-logout')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async backchannelLogout(@Body('logout_token') token: unknown) {
    let sid: string;
    try {
      ({ sid } = await this.heimdall.verifyLogoutToken(token));
    } catch {
      // Section 2.8: 400 for a token that is not valid. The reason stays in the log.
      throw new BadRequestException({ error: 'invalid_request' });
    }
    await this.sessions.revokeByProviderSid(this.heimdall.name, sid);
    return {};
  }

  // ---- Heimdall ------------------------------------------------------------------------------

  /**
   * Sends the browser to Heimdall. `intent=link` adds Heimdall to the signed-in account instead
   * of signing in.
   */
  @Get('heimdall/start')
  async heimdallStart(
    @Query('intent') intent: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const linking = intent === 'link';
    if (
      linking &&
      !(await this.sessions.resolve(readSessionToken(req.headers.cookie)))
    ) {
      return res.redirect(303, '/public/login');
    }
    let step: SignInStep;
    try {
      step = await this.heimdall.signIn();
    } catch {
      return res.redirect(
        303,
        linking ? AFTER.linked('unavailable') : AFTER.failed('unavailable'),
      );
    }
    if (step.kind !== 'redirect') {
      return res.redirect(303, AFTER.failed('failed'));
    }
    res.cookie(
      transactionCookie(),
      `${linking ? 'link' : 'signin'}.${step.transaction}`,
      cookieOptions(OIDC_TRANSACTION_MS),
    );
    return res.redirect(303, step.url);
  }

  /** Heimdall sends the browser back here with a code (or an error). */
  @Get('heimdall/callback')
  async heimdallCallback(@Req() req: Request, @Res() res: Response) {
    const saved = readCookie(req.headers.cookie, transactionCookie()) ?? '';
    res.clearCookie(transactionCookie(), clearCookieOptions());
    const [intent, transaction] = saved.split('.', 2);
    const linking = intent === 'link';
    const fail = (code: string) =>
      res.redirect(303, linking ? AFTER.linked(code) : AFTER.failed(code));

    if (typeof req.query.error === 'string') {
      // access_denied: the person cancelled at Heimdall. Anything else is Heimdall's problem.
      return fail(req.query.error === 'access_denied' ? 'cancelled' : 'failed');
    }
    let identity: ExternalIdentity;
    try {
      // Rebuilt from the registered redirect URI: behind the proxy, this request's own host is
      // the API's, not the one Heimdall redirected to.
      const settings = heimdallSettings();
      if (!settings) {
        return fail('unavailable');
      }
      const callback = new URL(settings.redirectUri);
      callback.search = new URL(req.originalUrl, 'http://unused').search;
      identity = await this.heimdall.completeSignIn(
        callback,
        transaction ?? '',
      );
    } catch {
      return fail('failed');
    }

    if (linking) {
      const resolved = await this.sessions.resolve(
        readSessionToken(req.headers.cookie),
      );
      if (!resolved) {
        return res.redirect(303, '/public/login');
      }
      const result = await this.identities.link(resolved.user.Id, identity);
      return res.redirect(303, AFTER.linked(result));
    }

    const userId = await this.identities.userFor(identity);
    if (userId !== null) {
      await this.endCurrentSession(req);
      await this.startSession(
        userId,
        this.heimdall.name,
        req,
        res,
        identity.session,
      );
      return res.redirect(303, AFTER.signedIn);
    }
    const ticket = await this.identities.startSignup(identity);
    res.cookie(signupCookie(), ticket, cookieOptions(SIGNUP_TTL_MS));
    return res.redirect(303, AFTER.signup);
  }

  /** The sign-up in progress: what the welcome page shows while a username is chosen. */
  @Get('signup')
  async pendingSignup(@Req() req: Request) {
    const pending = await this.identities.pendingSignup(
      readCookie(req.headers.cookie, signupCookie()),
    );
    if (!pending) {
      throw new NotFoundException('There is no sign-up in progress.');
    }
    return { email: pending.email, expiresAt: pending.expiresAt };
  }

  /** Finishes a Heimdall sign-up: creates the account and signs it in. */
  @Post('signup')
  async completeSignup(
    @Body() choice: CompleteSignupDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = await this.identities.completeSignup(
      readCookie(req.headers.cookie, signupCookie()),
      choice,
    );
    res.clearCookie(signupCookie(), clearCookieOptions());
    await this.endCurrentSession(req);
    await this.startSession(userId, this.heimdall.name, req, res);
    return this.userService.getOwnProfile(userId);
  }

  /** How the signed-in person can sign in, for their profile. */
  @Get('methods')
  async methods(@Req() req: RequestModel) {
    const methods = await this.identities.methods(
      req.user.Id,
      heimdallSettings()?.issuer ?? null,
    );
    return {
      ...methods,
      heimdall: { ...methods.heimdall, available: this.heimdall.enabled },
    };
  }

  @Delete('heimdall/link')
  @HttpCode(204)
  async unlinkHeimdall(@Req() req: RequestModel) {
    const issuer = heimdallSettings()?.issuer;
    if (issuer) {
      await this.identities.unlink(req.user.Id, issuer);
    }
  }

  // ---- Helpers -------------------------------------------------------------------------------

  private async signInOrRefuse(
    provider: AuthProvider,
    credentials: LoginUserDto,
  ) {
    try {
      const step = await provider.signIn(credentials);
      if (step.kind === 'signed-in') {
        return step.user;
      }
    } catch (error) {
      if (error instanceof SignInError) {
        throw new UnauthorizedException(error.message);
      }
      throw error;
    }
    throw new UnauthorizedException('Sign in through your identity provider.');
  }

  private async startSession(
    userId: number,
    provider: string,
    req: Request,
    res: Response,
    providerData?: ProviderSession,
  ) {
    const { token } = await this.sessions.create(userId, provider, {
      userAgent: req.headers['user-agent'],
      providerData,
    });
    res.cookie(sessionCookieName(), token, sessionCookieOptions());
  }

  /** Signing in again, or as someone else, retires the session this browser had. */
  private async endCurrentSession(req: Request): Promise<string | null> {
    const resolved = await this.sessions.resolve(
      readSessionToken(req.headers.cookie),
    );
    if (!resolved) {
      return null;
    }
    await this.sessions.revoke(resolved.session);
    return resolved.session.provider;
  }
}
