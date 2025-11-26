const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

let datos = [
    { _id: 1, power_level: 50, audit_trail: [] },
];

// Servidor HTTP
const server = http.createServer(app);

// WebSocket
const wss = new WebSocket.Server({ server });

let nextId = 1;

function createMessage(initialValue) {
    return {
        _id: nextId++,
        power_level: Number(initialValue),
        audit_trail: [],
    };
}

async function sendTo(wsUrl, message, options = { retries: 5, delayMs: 500 }) {
    let attempt = 0;
    const { retries, delayMs } = options;
    const errMsgs = [];
    while (attempt < retries) {
        attempt++;
        try {
            await new Promise((resolve, reject) => {
                const wsClient = new WebSocket(wsUrl);
                wsClient.on('open', () => {
                    wsClient.send(JSON.stringify(message));
                    wsClient.close();
                    resolve();
                });
                wsClient.on('error', (err) => {
                    reject(err);
                });
            });
            return;
        } catch (err) {
            errMsgs.push(err.message || String(err));
            await new Promise(r => setTimeout(r, delayMs));
        }
    }
    throw new Error(`no se envio a ${wsUrl} despues ${retries} reintentar: ${errMsgs.join('; ')}`);
}


app.post('/start', async (req, res) => {
    const { power_level } = req.body;
    if (power_level === undefined || isNaN(Number(power_level))) {
        return res.status(400).json({ error: 'debe ser numero' });
    }
    const msg = createMessage(power_level);
    try {
        await sendTo('ws://nodob:8081', msg);
        res.json({ status: 'sent', data: msg });
    } catch (err) {
        console.error('Error ', err.message || err);
        res.status(500).json({ error: 'error', details: err.message });
    }
});


wss.on('connection', ws => {
    console.log('WebSocket conectado a nodo a');
    ws.send(JSON.stringify({ type: 'ready', message: 'Conexión establecida' }));

    ws.on('message', async (raw) => {
        try {
            const msg = JSON.parse(raw.toString());
            if (msg && msg.power_level !== undefined) {
                console.log(`CICLO COMPLETADO: ${msg.power_level}`);
                wss.clients.forEach(c => {
                    if (c.readyState === WebSocket.OPEN) {
                        c.send(JSON.stringify({ type: 'final', power_level: msg.power_level, audit_trail: msg.audit_trail }));
                    }
                });
            } else if (msg && msg.action === 'start' && msg.power_level !== undefined) {   
                const newMsg = createMessage(msg.power_level);
                try {
                    await sendTo('ws://nodob:8081', newMsg);
                    ws.send(JSON.stringify({ type: 'sent', data: newMsg }));
                } catch (err) {
                    ws.send(JSON.stringify({ type: 'error', message: err.message }));
                }
            } else {
                console.log('recibido:', msg);
            }
        } catch (err) {
            console.error('Json invalido:', err.message);
        }
    });
});

//iniciar el server
const port = process.env.PORT || 8080;
server.listen(port, () => console.log(`NodoA en ${port}`));