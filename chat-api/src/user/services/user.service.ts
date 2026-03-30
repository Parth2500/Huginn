import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { catchError, from, map, Observable, of, switchMap } from 'rxjs';
import { Repository, UpdateResult } from 'typeorm';
import { User } from '../entities/user.entity';
import { IUser } from '../entities/user.interface';
import { IUserService } from './iservices/user.service.interface';
import {
  IPaginationOptions,
  paginate,
  Pagination,
} from 'nestjs-typeorm-paginate';
import {
  IPasswordService,
  PasswordToken,
} from 'src/authentication/services/iservices/password.service.interface';
import {
  AuthenticationToken,
  IAuthenticationService,
} from 'src/authentication/services/iservices/authentication.service.interface';

@Injectable()
export class UserService implements IUserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @Inject(AuthenticationToken)
    private readonly authService: IAuthenticationService,
    @Inject(PasswordToken) private readonly passwordService: IPasswordService,
  ) {}

  //#region create
  create(createUser: IUser): Observable<IUser> {
    return this.isMailExists(createUser.email).pipe(
      switchMap((exists: boolean) => {
        if (!exists) {
          return this.passwordService.hashPassword(createUser.password).pipe(
            switchMap((hashedPassword: string) => {
              createUser.password = hashedPassword;
              return from(this.userRepository.save(createUser)).pipe(
                switchMap((user: IUser) => this.findById(user.Id)),
              );
            }),
          );
        } else {
          throw new HttpException(
            'Email is already in use!',
            HttpStatus.CONFLICT,
          );
        }
      }),
    );
  }
  //#endregion

  //#region find
  findAll(options: IPaginationOptions): Observable<Pagination<IUser>> {
    return from(paginate<User>(this.userRepository, options));
  }

  findById(id: number): Observable<IUser> {
    return from(
      this.userRepository.findOne({
        where: {
          Id: id,
        },
      }),
    ).pipe(
      catchError(() => {
        throw new HttpException('User Not Found!', HttpStatus.NOT_FOUND);
      }),
    );
  }

  public findByIdPromise(id: number): Promise<IUser> {
    return this.userRepository.findOne({
      where: {
        Id: id,
      },
    });
  }

  findByEmail(email: string): Observable<IUser> {
    return from(
      this.userRepository.findOne({
        where: {
          email: email,
        },
      }),
    ).pipe(
      catchError(() => {
        throw new HttpException('User Not Found!', HttpStatus.NOT_FOUND);
      }),
    );
  }

  findByEmailForLogin(email: string): Observable<IUser> {
    return from(
      this.userRepository.findOne({
        where: {
          email: email,
        },
        select: {
          Id: true,
          email: true,
          username: true,
          password: true,
        },
      }),
    ).pipe(
      catchError(() => {
        throw new HttpException('User Not Found!', HttpStatus.NOT_FOUND);
      }),
    );
  }

  findByUserName(username: string): Observable<IUser> {
    return from(
      this.userRepository.findOne({
        where: {
          username: username,
        },
      }),
    ).pipe(
      catchError(() => {
        throw new HttpException('User Not Found!', HttpStatus.NOT_FOUND);
      }),
    );
  }
  //#endregion

  //#region update
  update(id: number, updateUser: IUser): Observable<IUser> {
    return this.findById(id).pipe(
      switchMap((foundUser: IUser) => {
        if (foundUser) {
          return from(
            this.userRepository.update(foundUser.Id, updateUser),
          ).pipe(switchMap(() => this.findById(foundUser.Id)));
        } else {
          throw new HttpException('No User Found!', HttpStatus.NOT_FOUND);
        }
      }),
    );
  }
  //#endregion

  //#region delete
  removeById(id: number): Observable<IUser> {
    return this.findById(id).pipe(
      switchMap((foundUser: IUser) => {
        if (foundUser) {
          return from(this.userRepository.delete(foundUser)).pipe(
            switchMap(() => of(foundUser)),
          );
        } else {
          throw new HttpException('No User Found!', HttpStatus.NOT_FOUND);
        }
      }),
    );
  }
  //#endregion

  //#region utility
  private isMailExists(email: string): Observable<boolean> {
    return from(
      this.userRepository.findOne({
        where: {
          email: email,
        },
      }),
    ).pipe(map((user: IUser) => (user ? true : false)));
  }

  //#endregion

  //#region  login
  login(loginUser: IUser): Observable<string> {
    return this.findByEmailForLogin(loginUser.email).pipe(
      switchMap((foundUser: IUser) => {
        if (foundUser) {
          return this.passwordService
            .validatePassword(loginUser.password, foundUser.password)
            .pipe(
              switchMap((match: boolean) => {
                if (match) {
                  return this.findById(foundUser.Id).pipe(
                    switchMap((payload: IUser) =>
                      this.authService.generateJwt(payload),
                    ),
                  );
                } else {
                  throw new HttpException(
                    'Login was not successful, wrong credentials!',
                    HttpStatus.UNAUTHORIZED,
                  );
                }
              }),
            );
        } else {
          throw new HttpException('No User Found!', HttpStatus.NOT_FOUND);
        }
      }),
    );
  }
  //#endregion
}
