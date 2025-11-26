const WebSocket = require('ws');

const port = process.env.PORT || 8081;

const wss = new WebSocket.Server({ port }, () => {
    console.log(`Nodob en ${port}`);
});

async function sendTo(url, message, options = { retries: 5, delayMs: 500 }) {
    const { retries, delayMs } = options;
    let attempt = 0;
    const errMsgs = [];
    while (attempt < retries) {
        attempt++;
        try {
            await new Promise((resolve, reject) => {
                const ws = new WebSocket(url);
                ws.on('open', () => {
                    ws.send(JSON.stringify(message));
                    ws.close();
                    resolve();
                });
                ws.on('error', reject);
            });
            return;
        } catch (err) {
            errMsgs.push(err.message || String(err));
            await new Promise(r => setTimeout(r, delayMs));
        }
    }
    throw new Error(`fallo en ${url} despues ${retries} reintentar: ${errMsgs.join('; ')}`);
}

wss.on('connection', (ws) => {
    console.log('Nodo B: conectado');
    ws.on('message', async (raw) => {
        let msg;
        try {
            msg = JSON.parse(raw.toString());
        } catch (err) {
            console.error('invalido', err.message);
            return;
        }

        console.log('nodob recivido:', msg);
        const value = Number(msg.power_level);
        if (isNaN(value)) {
            console.error('el valor no es numerico');
            return;
        }

        // Lógica de transformación
        if (value % 2 === 0) {
            msg.power_level = value * 2;
        } else {
            msg.power_level = value + 1;
        }
        msg.audit_trail = msg.audit_trail || [];
        msg.audit_trail.push('B_processed');

        console.log('enviando a nodoc:', msg);
        try {
            await sendTo('ws://nodoc:8082', msg);
        } catch (err) {
            console.error('error', err.message || err);
        }
    });
});
