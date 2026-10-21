import { Observable } from 'rxjs';
import { IPublicUser, IUser } from 'src/user/entities/user.interface';
import { UpdateProfileDto } from 'src/user/dto/update-profile.dto';

export interface IUserService {
  create(createUser: IUser): Observable<IUser>;
  findById(id: number): Observable<IUser>;
  findByIdPromise(id: number): Promise<IUser>;
  findByEmail(email: string): Observable<IUser>;
  findByEmailForLogin(email: string): Observable<IUser>;
  findByUserName(username: string): Observable<IUser>;
  searchByUsername(query: string, excludeId?: number): Observable<IUser[]>;
  findPublicById(id: number): Promise<IPublicUser | null>;
  getOwnProfile(id: number): Promise<IUser>;
  updateProfile(id: number, changes: UpdateProfileDto): Promise<IUser>;
  setAvatar(id: number, avatarUrl: string | null): Promise<string | null>;
  usernameAvailability(
    raw: string,
    excludeId?: number,
  ): Promise<{ available: boolean; reason?: string }>;
  update(id: number, updateUser: IUser): Observable<IUser>;
  removeById(id: number): Observable<IUser>;
}

export const UserToken = 'UserService';
