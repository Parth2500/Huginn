import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { catchError, from, map, Observable, of, switchMap } from 'rxjs';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { IPublicUser, IUser, toPublicUser } from '../entities/user.interface';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import {
  normalizeUsername,
  usernameKey,
  usernameProblem,
} from '../username.policy';
import { IUserService } from './iservices/user.service.interface';
import {
  IPasswordService,
  PasswordToken,
} from 'src/authentication/services/iservices/password.service.interface';
import {
  AuthenticationToken,
  IAuthenticationService,
} from 'src/authentication/services/iservices/authentication.service.interface';

const PUBLIC_COLUMNS = [
  'user.Id',
  'user.username',
  'user.displayName',
  'user.avatarUrl',
];

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
    createUser.email = createUser.email.trim().toLowerCase();
    createUser.username = normalizeUsername(createUser.username);
    const problem = usernameProblem(createUser.username);
    if (problem) {
      throw new HttpException(problem, HttpStatus.BAD_REQUEST);
    }
    createUser.usernameKey = usernameKey(createUser.username);
    return this.isUsernameTaken(createUser.username).pipe(
      switchMap((taken: boolean) => {
        if (taken) {
          throw new HttpException(
            'That username is taken. Try another one.',
            HttpStatus.CONFLICT,
          );
        }
        return this.isMailExists(createUser.email);
      }),
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
  /**
   * People search by username or display name, excluding the searcher. Never returns emails.
   *
   * Two index-only steps, measured on 1,000,000 users at well under a millisecond each:
   *  1. Usernames that start with the query, read in order straight off the unique index
   *     (byte-order collation). Common names fill all 8 results here.
   *  2. Only if fewer than 8 were found and the query has 3+ characters: names that contain it,
   *     via the trigram indexes on the username key and the display name.
   */
  searchByUsername(query: string, excludeId?: number): Observable<IUser[]> {
    return from(this.search(query, excludeId));
  }

  private async search(query: string, excludeId?: number): Promise<IUser[]> {
    const limit = 8;
    const needle = query.normalize('NFKC').trim().toLowerCase();
    if (!needle) {
      return [];
    }
    const escaped = needle.replace(/[\\%_]/g, (c) => `\\${c}`);
    const base = () => {
      const builder = this.userRepository
        .createQueryBuilder('user')
        .select(PUBLIC_COLUMNS);
      if (excludeId) {
        builder.andWhere('user.Id != :excludeId', { excludeId });
      }
      return builder;
    };

    const prefix = await base()
      .andWhere('user.usernameKey LIKE :prefix', { prefix: `${escaped}%` })
      .orderBy('user.usernameKey', 'ASC')
      .limit(limit)
      .getMany();
    if (prefix.length >= limit || needle.length < 3) {
      return prefix;
    }

    const contains = base()
      .andWhere(
        '(user.usernameKey LIKE :contains OR lower(user.displayName) LIKE :contains)',
        {
          contains: `%${escaped}%`,
        },
      )
      .orderBy('user.usernameKey', 'ASC')
      .limit(limit - prefix.length);
    if (prefix.length) {
      contains.andWhere('user.Id NOT IN (:...seen)', {
        seen: prefix.map((u) => u.Id),
      });
    }
    return [...prefix, ...(await contains.getMany())];
  }

  async findPublicById(id: number): Promise<IPublicUser | null> {
    const user = await this.userRepository.findOne({ where: { Id: id } });
    return user ? toPublicUser(user, true) : null;
  }

  /** The signed-in user's own profile, the only place their email is returned. */
  async getOwnProfile(id: number): Promise<IUser> {
    const user = await this.userRepository.findOne({
      where: { Id: id },
      select: {
        Id: true,
        username: true,
        displayName: true,
        bio: true,
        avatarUrl: true,
        created_at: true,
        email: true,
      },
    });
    if (!user) {
      throw new HttpException('User Not Found!', HttpStatus.NOT_FOUND);
    }
    return user;
  }

  async updateProfile(id: number, changes: UpdateProfileDto): Promise<IUser> {
    const update: Partial<User> = {};
    if (changes.username !== undefined) {
      const username = normalizeUsername(changes.username);
      const problem = usernameProblem(username);
      if (problem) {
        throw new HttpException(problem, HttpStatus.BAD_REQUEST);
      }
      if (await this.isUsernameTakenPromise(username, id)) {
        throw new HttpException(
          'That username is taken. Try another one.',
          HttpStatus.CONFLICT,
        );
      }
      update.username = username;
      update.usernameKey = usernameKey(username);
    }
    if (changes.displayName !== undefined) {
      update.displayName =
        changes.displayName.normalize('NFKC').trim().replace(/\s+/g, ' ') ||
        null;
    }
    if (changes.bio !== undefined) {
      update.bio = changes.bio.trim() || null;
    }
    if (Object.keys(update).length) {
      await this.userRepository.update(id, update);
    }
    return this.getOwnProfile(id);
  }

  /** Sets (or clears) the photo and returns the previous path so the caller can delete the file. */
  async setAvatar(
    id: number,
    avatarUrl: string | null,
  ): Promise<string | null> {
    const user = await this.userRepository.findOne({ where: { Id: id } });
    await this.userRepository.update(id, { avatarUrl });
    return user?.avatarUrl ?? null;
  }

  /** Whether a username could be registered or changed to, and why not. */
  async usernameAvailability(
    raw: string,
    excludeId?: number,
  ): Promise<{ available: boolean; reason?: string }> {
    const problem = usernameProblem(raw);
    if (problem) {
      return { available: false, reason: problem };
    }
    if (await this.isUsernameTakenPromise(raw, excludeId)) {
      return { available: false, reason: 'That username is taken.' };
    }
    return { available: true };
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
  /** Usernames are unique by canonical key, so "maya" and "Maya" can't both exist. */
  private isUsernameTaken(username: string): Observable<boolean> {
    return from(this.isUsernameTakenPromise(username));
  }

  private async isUsernameTakenPromise(
    username: string,
    excludeId?: number,
  ): Promise<boolean> {
    const existing = await this.userRepository.findOne({
      where: { usernameKey: usernameKey(username) },
      select: { Id: true },
    });
    return !!existing && existing.Id !== excludeId;
  }

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
    return this.findByEmailForLogin(loginUser.email.trim().toLowerCase()).pipe(
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
