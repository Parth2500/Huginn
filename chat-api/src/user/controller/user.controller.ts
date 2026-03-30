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
} from '@nestjs/common';
import { Pagination } from 'nestjs-typeorm-paginate';
import { map, Observable, switchMap } from 'rxjs';
import { CreateUserDto } from '../dto/create-user.dto';
import { LoginUserDto } from '../dto/login-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { LoginResponse } from '../entities/login-response.interface';
import { IUser } from '../entities/user.interface';
import {
  IUserHelperService,
  UserHelperToken,
} from '../services/iservices/user-helper.service.interface';
import {
  IUserService,
  UserToken,
} from '../services/iservices/user.service.interface';

@Controller('users')
export class UserController {
  constructor(
    @Inject(UserToken)
    private readonly userService: IUserService,
    @Inject(UserHelperToken)
    private readonly userHelperService: IUserHelperService,
  ) {}

  @Post()
  create(@Body() createUserDto: CreateUserDto): Observable<IUser> {
    return this.userHelperService
      .createUserDtoToEntity(createUserDto)
      .pipe(switchMap((user: IUser) => this.userService.create(user)));
  }

  @Get()
  findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 10,
  ): Observable<Pagination<IUser>> {
    limit = limit > 100 ? 100 : limit;
    return this.userService.findAll({
      page,
      limit,
      route: 'http://localhost:3000/api/users',
    });
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.userService.findById(+id);
  }

  @Get('email/:email')
  findByEmail(@Param('email') email: string) {
    return this.userService.findByEmail(email);
  }

  @Get('username/:username')
  findByUserName(@Param('username') username: string) {
    return this.userService.findByUserName(username);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.userService.update(+id, updateUserDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.userService.removeById(+id);
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
              expires_in: 36000,
            };
            return response;
          }),
        );
      }),
    );
  }
}
