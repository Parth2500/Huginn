import { Injectable } from '@angular/core';
import { Socket, SocketIoConfig } from 'ngx-socket-io';
import { getAccessToken } from 'src/app/app.module';

const config: SocketIoConfig = {
  url: 'http://localhost:3000/',
  options: {
    extraHeaders: {
      Authorization: getAccessToken() ?? '',
    },
  },
};

@Injectable({
  providedIn: 'root',
})
export class CustomSocketService extends Socket {
  constructor() {
    super(config);
  }
}
