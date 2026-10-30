import { createServer } from 'http';
import { WebSocketServer } from 'ws';
let server = createServer();
let wss = new WebSocketServer({ server });
wss.on('connection', (ws) => {
    console.log('CONN');
    ws.send(JSON.stringify([[0, null]]));
    ws.on('message', (d) => console.log('MSG:', d.toString().slice(0, 80)));
});
server.listen(9002);
console.log('mini server on 9002');
