import { Injectable } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server } from 'socket.io';

@Injectable()
@WebSocketGateway({ cors: { origin: true } })
export class AlertsGateway {
  @WebSocketServer()
  server: Server;

  /** Emit a real-time alert event to all connected clients. */
  broadcast(event: unknown): void {
    if (this.server) {
      this.server.emit('alert', event);
    }
  }
}
