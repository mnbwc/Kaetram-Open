import WebSocket from '../websocket';
import Connection from '../connection';

import log from '@kaetram/common/util/log';
import config from '@kaetram/common/config';
import Utils from '@kaetram/common/util/utils';
import { Modules } from '@kaetram/common/network';
import { WebSocketServer } from 'ws';
import http from 'http';

import type SocketHandler from '../sockethandler';
import type { HeaderWebSocket } from '../connection';
import type { ConnectionInfo } from '@kaetram/common/types/network';
import type { RawData, WebSocket as WSLibrary } from 'ws';

/**
 * A standard `ws` implementation of the WebSocket server, used as a
 * drop-in replacement for uWS when the native binary is unavailable
 * for the current Node.js version.
 */

interface InfoSocket extends WSLibrary {
    connectionInfo?: ConnectionInfo & { remoteAddress?: string };
}

export default class UWS extends WebSocket {
    public constructor(socketHandler: SocketHandler) {
        super(config.host, config.port, socketHandler);

        let server = http.createServer((_request, response) => {
            response.end('This is server, why are you here?');
        });

        let wss = new WebSocketServer({ server });

        wss.on('connection', (socket: WSLibrary, request) => {
            socket.on('message', (data: RawData) => {
                log.info(`[ws] pre-connection raw message: ${data.toString().slice(0, 60)}`);
            });
            this.handleConnection(socket, request);
        });
        wss.on('error', (error: Error) => log.error(`WebSocket error: ${error.message}`));

        server.on('error', (error: Error) => {
            log.error(`Failed to listen on port ${config.port}: ${error.message}`);
            throw error;
        });

        server.listen(config.port, () => {
            log.info(`WebSocket server (ws) listening on port ${config.port}.`);
            this.initializedCallback?.();
        });
    }

    /**
     * Handles the creation and organizing of a socket. We store the connection
     * info on the socket object itself so we can identify the socket later on.
     */

    private handleConnection(socket: WSLibrary, request: http.IncomingMessage): void {
        let info = socket as InfoSocket,
            instance = Utils.createInstance(Modules.EntityType.Player);

        // Store the connection info on the socket object.
        info.connectionInfo = {
            instance,
            remoteAddress: (request.headers['cf-connecting-ip'] as string) || request.socket.remoteAddress || ''
        };

        let connection = new Connection(instance, {
            remoteAddress: info.connectionInfo.remoteAddress || '',
            getRemoteAddressAsText: () => Buffer.from(info.connectionInfo?.remoteAddress || ''),
            end: (code: number, reason: string) => info.close(code, reason),
            send: (message: string) => {
                info.send(message);
                return 0;
            }
        } as unknown as HeaderWebSocket);

        info.on('message', (data: RawData) => {
            log.info(`[ws] raw message event fired.`);
            this.handleMessage(info, data);
        });
        info.on('close', () => this.handleClose(connection));

        this.addCallback?.(connection);
    }

    /**
     * Responsible for converting the incoming data into a string and then parsing it into JSON.
     * @param socket The socket that the message was received from (used to identify the connection).
     * @param data Contains buffer data that we convert into a string.
     */

    private handleMessage(socket: InfoSocket, data: RawData): void {
        let connection = this.socketHandler.get(socket.connectionInfo!.instance);

        log.debug(`[ws] Received message: ${data.toString().slice(0, 100)}`);

        // Prevent the server from crashing if the connection is not found.
        if (!connection) return log.error('No connection found for incoming message.');

        // Increment the rate for the connection.
        connection.messageRate++;

        // Reject the connection once we reach the rate limit threshold.
        if (connection.messageRate > config.messageLimit) return connection.reject('ratelimit');

        try {
            // Convert the buffer into a string.
            let message = data.toString();

            // Prevent duplicates in a short period of time.
            if (connection.isDuplicate(message)) return;

            // Pass the parsed JSON onto the message handler.
            connection.messageCallback?.(JSON.parse(message));
        } catch (error) {
            log.error(`Message could not be parsed: ${data.toString()}.`);
            log.error(error);
        }
    }

    /**
     * Handles closing the socket and removing our connection from the handler.
     * @param connection The connection that was closed.
     */

    private handleClose(connection: Connection): void {
        // Mark the connection as closed to prevent any further messages from being sent.
        connection.closed = true;

        this.socketHandler.remove(connection.instance);

        connection.handleClose();
    }
}
