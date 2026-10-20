import { Injectable } from '@angular/core';
import { Socket, SocketIoConfig } from 'ngx-socket-io';

const config: SocketIoConfig = {
  url: 'http://localhost:3000/',
  options: {
    autoConnect: false,
  },
};

@Injectable({
  providedIn: 'root',
})
export class CustomSocketService extends Socket {
  constructor() {
    super(config);
  }

  /** (Re)connect with the current access token, so switching accounts in one tab works. */
  connectWithToken(token: string) {
    const manager = this.ioSocket.io;
    const current = manager.opts.extraHeaders?.Authorization;
    if (this.ioSocket.connected && current === token) {
      return;
    }
    if (this.ioSocket.connected || this.ioSocket.active) {
      this.disconnect();
    }
    manager.opts.extraHeaders = { Authorization: token };
    this.connect();
  }
}
