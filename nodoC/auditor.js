const WebSocket = require('ws');

const port = process.env.PORT || 8082;

const wss = new WebSocket.Server({ port }, () => {
    console.log(`Nodo C en ${port}`);
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
    console.log('Nodo C: cliente conectado');
    ws.on('message', async (raw) => {
        let msg;
        try {
            msg = JSON.parse(raw.toString());
        } catch (err) {
            console.error('NodoC: JSON inválido', err.message);
            return;
        }

        console.log('nodoc:', msg);
        const value = Number(msg.power_level);
        if (isNaN(value)) {
            console.error('Nodo C: power_level no es numérico');
            return;
        }

        // Lógica auditor
        msg.power_level = value - 5;
        msg.audit_trail = msg.audit_trail || [];
        msg.audit_trail.push('C_verified');

        console.log('nodoc sending back to nodoa:', msg);
        try {
            await sendTo('ws://nodoa:8080', msg);
        } catch (err) {
            console.error('error al enviar al nodoa', err.message || err);
        }
    });
});
