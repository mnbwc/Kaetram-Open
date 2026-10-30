import type { WebSocket } from 'ws';
import type { MessageCallback } from '@kaetram/common/types/network';

/**
 * Hub connection wrapper around a standard `ws` socket
 * (previously used uWS typed sockets).
 */

export default class Connection {
    public messageCallback?: MessageCallback;

    public constructor(public socket: WebSocket) {}

    /**
     * Sends a message to the socket connection.
     * @param message A message in a string format.
     */

    public send(message: string): void {
        this.socket.send(message);
    }

    /**
     * Gracefully closes the socket connection.
     */

    public close(): void {
        this.socket.close();
    }

    /**
     * Callback for when a message is received over the socket.
     * @param callback Contains the string message that was received.
     */

    public onMessage(callback: MessageCallback): void {
        this.messageCallback = callback;
    }
}
