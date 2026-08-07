import express from 'express';
import http from 'http';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { Server as SocketIOServer } from 'socket.io';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const CONTROLLER_SECRET_KEY = "KNKX_ADMIN_SECRET_2026";

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
    cors: { origin: "*" }
});

// --- SERVER RSA KEYPAIR GENERATION (RSA-OAEP with SHA-256) ---
const serverKeyPair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicExponent: 0x10001,
    publicKeyEncoding: { type: 'spki', format: 'jwk' },
    privateKeyEncoding: { type: 'pkcs8', format: 'jwk' }
});

// Map to store client public key JWKs by socket ID
const clientPublicKeys = new Map();

function encryptForClientSocket(dataObj, socketId) {
    const clientJwk = clientPublicKeys.get(socketId);
    if (!clientJwk) return dataObj;

    try {
        const jsonStr = JSON.stringify(dataObj);
        const aesKey = crypto.randomBytes(32);
        const iv = crypto.randomBytes(12);

        const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
        let encryptedText = cipher.update(jsonStr, 'utf8', 'base64');
        encryptedText += cipher.final('base64');
        const authTag = cipher.getAuthTag().toString('base64');

        const fullCiphertext = encryptedText + ':' + authTag;

        const clientPublicKey = crypto.createPublicKey({
            key: clientJwk,
            format: 'jwk'
        });

        const encryptedAesKey = crypto.publicEncrypt({
            key: clientPublicKey,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: 'sha256'
        }, aesKey);

        return {
            k: encryptedAesKey.toString('base64'),
            i: iv.toString('base64'),
            d: fullCiphertext
        };
    } catch (err) {
        console.error('Server encryption error:', err);
        return dataObj;
    }
}

function decryptFromClient(pkg) {
    if (!pkg || typeof pkg !== 'object' || !pkg.k || !pkg.i || !pkg.d) return pkg;
    try {
        const encryptedAesKeyBuf = Buffer.from(pkg.k, 'base64');
        const serverPrivateKey = crypto.createPrivateKey({
            key: serverKeyPair.privateKey,
            format: 'jwk'
        });

        const aesKey = crypto.privateDecrypt({
            key: serverPrivateKey,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: 'sha256'
        }, encryptedAesKeyBuf);

        const ivBuf = Buffer.from(pkg.i, 'base64');
        const parts = pkg.d.split(':');
        const cipherTextBuf = Buffer.from(parts[0], 'base64');
        const authTagBuf = Buffer.from(parts[1], 'base64');

        const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, ivBuf);
        decipher.setAuthTag(authTagBuf);
        let decrypted = decipher.update(cipherTextBuf, undefined, 'utf8');
        decrypted += decipher.final('utf8');

        return JSON.parse(decrypted);
    } catch (err) {
        console.error('Server decryption error:', err);
        return pkg;
    }
}

let gameState = {
    showMHC: true,
    currentActiveRound: 1,
    globalTotalPrize: 0,
    currentMoneyLayoutV1: ["0 $A", "500 $A", "500 $A", "750 $A", "750 $A", "750 $A", "1.000 $A", "1.000 $A", "1.000 $A", "1.500 $A", "2.500 $A", "5.000 $A"],
    currentMoneyLayoutV2: ["1", "1", "1", "2", "2", "2", "2", "3", "3", "3", "3", "4"],
    isSo5Checked: false,
    moneyAnimationChecked: false,
    moneyGridStateV1: {}, 
    moneyGridStateV2: {},   
    symbolBoxesStateV1: {}, 
    symbolBoxesStateV2: {}, 
    currentRoundData: {
        topic: "TỪ CHỦ ĐỀ 1",
        A: { text: 'Câu hỏi mẫu A', correct: true, excelAnsRaw: '' },
        B: { text: 'Câu hỏi mẫu B', correct: false, excelAnsRaw: '' },
        C: { text: 'Câu hỏi mẫu C', correct: true, excelAnsRaw: '' }
    },
    displayClasses: [],
    activeQuestion: null,
    activeSideSign: null,
    round1CtrlState: {
        selectedStatusAdmin: null,
        trueBtnClass: "ans-btn",
        falseBtnClass: "ans-btn"
    },
    round2CtrlState: {
        text: 'ĐÁP ÁN',
        isCorrect: true,
        backgroundImage: "url('Whitebar2.png')",
        textColor: "#000000"
    },
    usedChoices: { A: false, B: false, C: false },
    currentRoundIndexR1: 0,
    currentRoundIndexR2: 0,
    round1TopicsData: [],
    round2TopicsData: [],
    lastAction: ''
};

function sanitizeStateForScreen(state) {
    if (!state) return state;

    const sanitized = JSON.parse(JSON.stringify(state));

    sanitized.excelRawDataV1 = "🐧";
    sanitized.excelRawDataV2 = "🐧";
    sanitized.round1TopicsData = "🐧";
    sanitized.round2TopicsData = "🐧";

    const displayClasses = Array.isArray(sanitized.displayClasses) ? sanitized.displayClasses : [];
    const isTopicShown = displayClasses.includes('show-topic');
    const isQuestionShown = displayClasses.includes('show-question');
    const isR2AnsShown = displayClasses.includes('show-r2-ans');
    const isR2ResultShown = displayClasses.includes('show-r2-result');
    const activeQ = sanitized.activeQuestion;

    if (sanitized.currentRoundData) {
        if (!isTopicShown) {
            sanitized.currentRoundData.topic = "🐧";
        }

        ['A', 'B', 'C'].forEach((qKey) => {
            if (sanitized.currentRoundData[qKey]) {
                const isThisActiveQ = (activeQ === qKey) && isQuestionShown;

                sanitized.currentRoundData[qKey].correct = "🐧";
                sanitized.currentRoundData[qKey].excelAnsRaw = "🐧";

                if (!isThisActiveQ) {
                    sanitized.currentRoundData[qKey].text = "🐧";
                }
            }
        });
    }

    if (sanitized.round2CtrlState) {
        sanitized.round2CtrlState.isCorrect = "🐧";

        if (!isR2AnsShown && !isR2ResultShown) {
            sanitized.round2CtrlState.text = "🐧";
        }
    }

    if (sanitized.round1CtrlState && sanitized.lastAction !== 'revealResult1') {
        sanitized.round1CtrlState.selectedStatusAdmin = "🐧";
    }

    return sanitized;
}

function sendEncryptedStateToSocket(socket) {
    const isController = socket.rooms.has('controller');
    const rawState = isController ? gameState : sanitizeStateForScreen(gameState);
    const encryptedPkg = encryptForClientSocket(rawState, socket.id);
    socket.emit('sync-full-state', encryptedPkg);
}

function broadcastState() {
    const sockets = io.sockets.sockets;
    for (const [id, socket] of sockets) {
        sendEncryptedStateToSocket(socket);
    }
}

io.on('connection', (socket) => {
    socket.join('screen');

    socket.emit('init-handshake', {
        jwk: {
            kty: serverKeyPair.publicKey.kty,
            n: serverKeyPair.publicKey.n,
            e: serverKeyPair.publicKey.e,
            alg: 'RSA-OAEP-256'
        }
    });

    socket.on('register-client-key', (data) => {
        if (data && data.jwk) {
            clientPublicKeys.set(socket.id, data.jwk);
            sendEncryptedStateToSocket(socket);
        }
    });

    socket.on('register-role', (data) => {
        let role = typeof data === 'object' ? data.role : data;
        let key = typeof data === 'object' ? data.key : null;

        if (role === 'controller' && key === CONTROLLER_SECRET_KEY) {
            socket.leave('screen');
            socket.join('controller');
        } else {
            socket.leave('controller');
            socket.join('screen');
        }
        sendEncryptedStateToSocket(socket);
    });

    socket.on('trigger-sound', (encryptedData) => {
        const data = decryptFromClient(encryptedData);
        if (data && data.sound === 'stop_all') {
            for (const [id, s] of io.sockets.sockets) {
                const enc = encryptForClientSocket({ action: 'stop' }, id);
                s.emit('stop-all-sounds-client', enc);
            }
        } else if (data && data.sound) {
            for (const [id, s] of io.sockets.sockets) {
                const enc = encryptForClientSocket({ sound: data.sound }, id);
                s.emit('play-sound-client', enc);
            }
        }
    });
    
    socket.on('update-game-state', (encryptedUpdatedState) => {
        const updatedState = decryptFromClient(encryptedUpdatedState);
        if (!updatedState) return;

        if (!socket.rooms.has('controller')) {
            return;
        }

        if (updatedState.round1TopicsData === "🐧") delete updatedState.round1TopicsData;
        if (updatedState.round2TopicsData === "🐧") delete updatedState.round2TopicsData;

        gameState = { ...gameState, ...updatedState };
        broadcastState();
    });

    socket.on('consume-action', () => {
        if (!socket.rooms.has('controller')) return;
        gameState.lastAction = '';
        broadcastState();
    });

    socket.on('disconnect', () => {
        clientPublicKeys.delete(socket.id);
    });
});

app.get('/controller', (_req, res) => {
    res.sendFile(path.join(__dirname, 'Controller.html'));
});

app.get('/screen', (_req, res) => {
    res.sendFile(path.join(__dirname, 'Screen.html'));
});

app.get('/', (_req, res) => {
    res.sendFile(path.join(__dirname, 'Controller.html'));
});

app.use(express.static(__dirname));

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server NodeJS running on port ${PORT}`);
});
