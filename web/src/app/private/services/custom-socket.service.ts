import { ApplicationRef, inject, Injectable } from '@angular/core';
import { Socket, SocketIoConfig } from 'ngx-socket-io';
import { Ack } from 'src/app/models/chat.interface';

/** How long a request waits for its acknowledgement before it counts as failed. */
const ACK_TIMEOUT_MS = 10_000;

// Same origin as the app (the dev server and the production proxy forward /socket.io to the API),
// so the browser sends the session cookie with the handshake.
const config: SocketIoConfig = {
  url: '/',
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

  private userId: number | undefined;

  /** (Re)connect as this person; switching accounts in one tab starts a fresh connection. */
  connectAs(userId: number) {
    if (this.ioSocket.active && this.userId === userId) {
      return;
    }
    if (this.ioSocket.active) {
      this.disconnect();
    }
    this.userId = userId;
    this.connect();
  }

  override disconnect() {
    this.userId = undefined;
    return super.disconnect();
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
