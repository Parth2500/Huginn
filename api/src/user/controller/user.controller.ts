import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Inject,
  Query,
  Req,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomBytes } from 'crypto';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import { map, Observable, of, switchMap } from 'rxjs';
import { RequestModel } from 'src/middleware/auth.middleware';
import { CreateUserDto } from '../dto/create-user.dto';
import { LoginUserDto } from '../dto/login-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { LoginResponse } from '../entities/login-response.interface';
import { IUser, toPublicUser } from '../entities/user.interface';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { UserEventsService } from '../services/user-events.service';
import {
  IUserHelperService,
  UserHelperToken,
} from '../services/iservices/user-helper.service.interface';
import {
  IUserService,
  UserToken,
} from '../services/iservices/user.service.interface';

/** The part of a multer upload this controller reads. */
interface UploadedImage {
  buffer: Buffer;
  size: number;
}

const AVATAR_MAX_BYTES = 512 * 1024;
const AVATAR_DIR = join(process.cwd(), 'uploads', 'avatars');

@Controller('users')
export class UserController {
  constructor(
    @Inject(UserToken)
    private readonly userService: IUserService,
    @Inject(UserHelperToken)
    private readonly userHelperService: IUserHelperService,
    private readonly userEvents: UserEventsService,
  ) {}

  @Post()
  create(@Body() createUserDto: CreateUserDto): Observable<IUser> {
    return this.userHelperService
      .createUserDtoToEntity(createUserDto)
      .pipe(switchMap((user: IUser) => this.userService.create(user)));
  }

  // There is deliberately no "list every user" or "find by email" route: people are found by
  // username search only, and emails stay private to their owner.

  // Declared before ':id' so "search" is not read as an id.
  @Get('search')
  search(@Query('q') q = '', @Req() req: RequestModel): Observable<IUser[]> {
    const query = q.trim();
    if (!query) {
      return of([]);
    }
    return this.userService.searchByUsername(query.slice(0, 50), req.user?.Id);
  }

  /** Live check for the sign-up and profile forms. Public, like any handle lookup. */
  @Get('username-available')
  async usernameAvailable(@Query('u') u = '', @Req() req: RequestModel) {
    return this.userService.usernameAvailability(
      String(u).slice(0, 64),
      req.user?.Id,
    );
  }

  @Get('me')
  me(@Req() req: RequestModel) {
    return this.userService.getOwnProfile(req.user.Id);
  }

  @Patch('me')
  async updateMe(@Body() changes: UpdateProfileDto, @Req() req: RequestModel) {
    const profile = await this.userService.updateProfile(req.user.Id, changes);
    this.userEvents.profileUpdated.next(toPublicUser(profile));
    return profile;
  }

  /** Profile photo. The app sends a square image it already resized (max 512 KB). */
  @Post('me/avatar')
  @UseInterceptors(
    FileInterceptor('avatar', { limits: { fileSize: AVATAR_MAX_BYTES } }),
  )
  async uploadAvatar(
    @UploadedFile() file: UploadedImage,
    @Req() req: RequestModel,
  ) {
    const ext = file && imageExtension(file.buffer);
    if (!ext) {
      throw new BadRequestException(
        'Upload a JPEG, PNG or WebP image under 512 KB.',
      );
    }
    await mkdir(AVATAR_DIR, { recursive: true });
    // Random, unguessable names; old photos are removed so storage doesn't grow per change.
    const name = `${req.user.Id}-${randomBytes(8).toString('hex')}.${ext}`;
    await writeFile(join(AVATAR_DIR, name), file.buffer);
    const previous = await this.userService.setAvatar(
      req.user.Id,
      `/api/uploads/avatars/${name}`,
    );
    await removeAvatarFile(previous);
    return this.publishProfile(req.user.Id);
  }

  @Delete('me/avatar')
  async deleteAvatar(@Req() req: RequestModel) {
    const previous = await this.userService.setAvatar(req.user.Id, null);
    await removeAvatarFile(previous);
    return this.publishProfile(req.user.Id);
  }

  /** What anyone may see about a person: never their email. */
  @Get(':id/profile')
  async profile(@Param('id') id: string) {
    const user = await this.userService.findPublicById(+id);
    if (!user) {
      throw new NotFoundException('That person could not be found.');
    }
    return user;
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.userService.findById(+id);
  }

  @Get('username/:username')
  findByUserName(@Param('username') username: string) {
    return this.userService.findByUserName(username);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @Req() req: RequestModel,
  ) {
    this.assertSelf(+id, req);
    // Passwords and emails are not changed through this route (it would store them unchecked).
    const { username } = updateUserDto;
    return this.userService.update(+id, username ? { username } : {});
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: RequestModel) {
    this.assertSelf(+id, req);
    return this.userService.removeById(+id);
  }

  private async publishProfile(id: number) {
    const profile = await this.userService.getOwnProfile(id);
    this.userEvents.profileUpdated.next(toPublicUser(profile));
    return profile;
  }

  private assertSelf(id: number, req: RequestModel) {
    if (req.user?.Id !== id) {
      throw new ForbiddenException('You can only change your own account.');
    }
  }

  @Post('login')
  login(@Body() loginUserDto: LoginUserDto): Observable<LoginResponse> {
    return this.userHelperService.loginUserDtoToEntity(loginUserDto).pipe(
      switchMap((user: IUser) => {
        return this.userService.login(user).pipe(
          map((jwt: string) => {
            const response: LoginResponse = {
              access_token: jwt,
              type: 'JWT',
              expires_in: 3600, // matches signOptions.expiresIn ('1h')
            };
            return response;
          }),
        );
      }),
    );
  }
}

/** Trust the file's bytes, not its name or declared type. */
function imageExtension(buffer?: Buffer): 'jpg' | 'png' | 'webp' | null {
  if (!buffer || buffer.length < 12) {
    return null;
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpg';
  }
  if (
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'png';
  }
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

async function removeAvatarFile(url: string | null) {
  const name = url?.split('/avatars/')[1];
  if (name && /^[\w-]+\.(jpg|png|webp)$/.test(name)) {
    await unlink(join(AVATAR_DIR, name)).catch(() => undefined);
  }
}
