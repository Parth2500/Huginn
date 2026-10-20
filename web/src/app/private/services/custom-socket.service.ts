import { ApplicationRef, inject, Injectable } from '@angular/core';
import { Socket, SocketIoConfig } from 'ngx-socket-io';
import { Ack } from 'src/app/models/chat.interface';

/** How long a request waits for its acknowledgement before it counts as failed. */
const ACK_TIMEOUT_MS = 10_000;

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
    super(config, inject(ApplicationRef));
  }

  /** (Re)connect with the current access token, so switching accounts in one tab works. */
  connectWithToken(token: string) {
    const manager = this.ioSocket.io;
    const current = manager.opts.extraHeaders?.['Authorization'];
    if (this.ioSocket.connected && current === token) {
      return;
    }
    if (this.ioSocket.connected || this.ioSocket.active) {
      this.disconnect();
    }
    manager.opts.extraHeaders = { Authorization: token };
    this.connect();
  }

  /**
   * A protocol v1 request: resolves with the server's acknowledgement, or with
   * `{ ok: false, error: 'offline' }` when the socket is down or the server doesn't answer in time.
   * Nothing is queued while offline; callers that must not lose a request (sends) keep an outbox.
   */
  async request<T extends object>(event: string, data: object = {}): Promise<Ack<T>> {
    if (!this.ioSocket.connected) {
      return { ok: false, error: 'offline' };
    }
    try {
      return await this.ioSocket.timeout(ACK_TIMEOUT_MS).emitWithAck(event, data);
    } catch {
      return { ok: false, error: 'offline' };
    }
  }
}
