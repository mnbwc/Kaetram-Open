import http from 'node:http';

import Connection from './connection';

import log from '@kaetram/common/util/log';
import config from '@kaetram/common/config';
import Utils from '@kaetram/common/util/utils';
import { WebSocketServer } from 'ws';

import type { RawData, WebSocket } from 'ws';

/**
 * The hub websocket works as a publisher/subscriber system. It is responsible for
 * synchronizing events between the servers without relying on ridiculous amount
 * of GET/POST API calls. Uses the standard `ws` library (uWS removed).
 */

interface HubSocket extends WebSocket {
    hubInstance?: string;
}

export default class Handler {
    public ready = false;

    private connections: { [instance: string]: Connection } = {};

    private connectionCallback?: (instance: string, connection: Connection) => void;
    private disconnectCallback?: (instance: string) => void;

    public constructor() {
        let server = http.createServer((_request, response) => {
                response.end('This is hub, why are you here?');
            }),
            wss = new WebSocketServer({ server, maxPayload: 32 * 1024 * 1024 });

        wss.on('connection', (socket: HubSocket, request) => {
            this.handleConnection(socket, request.socket.remoteAddress || '');
        });

        wss.on('error', (error: Error) => log.error(`Hub websocket error: ${error.message}`));

        server.on('error', (error: Error) => log.error(`Hub failed to listen: ${error.message}`));

        server.listen(config.hubWsPort, () => {
            log.notice(`Hub websocket listening on port ${config.hubWsPort}.`);
            this.ready = true;
        });
    }

    /**
     * Grabs a connection based on the instance provided.
     * @param instance The instance of the server we want to grab.
     * @returns The WebSocket connection given the instance.
     */

    private get(instance: string): Connection {
        return this.connections[instance];
    }

    /**
     * Handles receiving a message from a socket. We just log the connection for now,
     * the identification part comes with the handshake packet in the next step.
     * @param socket The socket that has just connected to the hub.
     * @param remoteAddress The address the connection originated from.
     */

    private handleConnection(socket: HubSocket, remoteAddress: string): void {
        log.notice(`Received a connection from ${remoteAddress}.`);

        let instance = Utils.createInstance();

        socket.hubInstance = instance;

        // We store the connection in the connections object so that we can use it later.
        this.connections[instance] = new Connection(socket);

        socket.on('message', (data: RawData) => this.handleMessage(socket, data));
        socket.on('close', () => this.handleClose(socket));

        // Create a new callback for when the connection has been established.
        this.connectionCallback?.(instance, this.connections[instance]);
    }

    /**
     * Handles a message from the socket. We decode the message and parse the JSON data.
     * @param socket The socket that the message was received from.
     * @param data Contains buffer of the message that was received.
     */

    private handleMessage(socket: HubSocket, data: RawData): void {
        let connection = socket.hubInstance ? this.get(socket.hubInstance) : undefined;

        if (!connection) return log.error(`No connection found for instance ${socket.hubInstance}`);

        try {
            let message = JSON.parse(data.toString());

            connection.messageCallback?.(message);
        } catch (error) {
            log.error(`Message could not be parsed: ${data.toString()}.`);
            log.error(error);
        }
    }

    /**
     * Handles closing a connection and removing the connection from the connections object.
     * @param socket The socket that has just closed.
     */

    private handleClose(socket: HubSocket): void {
        let instance = socket.hubInstance;

        if (!instance) return;

        this.disconnectCallback?.(instance);

        delete this.connections[instance];
    }

    /**
     * Callback for when a connection has been established with the hub.
     * @param callback Contains the connection object.
     */

    public onConnection(callback: (instance: string, connection: Connection) => void): void {
        this.connectionCallback = callback;
    }

    /**
     * Callback for when a connection has been closed.
     * @param callback Contains the instance of the server that has been disconnected.
     */

    public onDisconnect(callback: (instance: string) => void): void {
        this.disconnectCallback = callback;
    }
}
