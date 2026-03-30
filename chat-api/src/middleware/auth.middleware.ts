import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NestMiddleware,
} from '@nestjs/common';
import { Request, Response } from 'express';
import {
  AuthenticationToken,
  IAuthenticationService,
} from 'src/authentication/services/iservices/authentication.service.interface';
import { IUser } from 'src/user/entities/user.interface';
import {
  IUserService,
  UserToken,
} from 'src/user/services/iservices/user.service.interface';

export interface RequestModel extends Request {
  user: IUser;
}

@Injectable()
export class AuthMiddleWare implements NestMiddleware {
  constructor(
    @Inject(AuthenticationToken) private authService: IAuthenticationService,
    @Inject(UserToken) private userService: IUserService,
  ) {}

  async use(req: RequestModel, res: Response, next: (error?: any) => void) {
    try {
      const tokens: string[] = req.headers['authorization'].split(' ');
      const decodedToken = await this.authService.validateJwt(tokens[1]);
      const user: IUser = await this.userService.findByIdPromise(
        decodedToken?.user?.Id,
      );
      if (!user) {
        throw new HttpException('Unauthorized!', HttpStatus.UNAUTHORIZED);
      }
      req.user = user;
      next();
    } catch (error) {
      throw new HttpException('Unauthorized!', HttpStatus.UNAUTHORIZED);
    }
  }
}
