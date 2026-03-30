import { Meta } from './meta.interface';
import { IUser } from './user.interface';

export interface IRoom {
  id?: number;
  name?: string;
  description?: string;
  users?: IUser[];
  created_at?: Date;
  updated_at?: Date;
}

export interface IRoomPaginate {
  items: IRoom[];
  meta: Meta;
}
