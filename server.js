import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Server Asymmetric & Hybrid Encryption Setup ---
const serverKeyPair = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'jwk' },
  privateKeyEncoding: { type: 'pkcs8', format: 'jwk' }
});

const serverPublicKeyJwk = {
  ...serverKeyPair.publicKey,
  alg: 'RSA-OAEP-256',
  ext: true,
  key_ops: ['encrypt']
};

const clientKeysMap = new Map(); // socket.id -> clientJwk

function encryptPacketForClient(dataObj, clientJwk) {
  if (!clientJwk) return dataObj;
  try {
    const jsonStr = JSON.stringify(dataObj);
    const aesKey = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);

    const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
    let ciphertext = cipher.update(jsonStr, 'utf8', 'base64');
    ciphertext += cipher.final('base64');
    const tag = cipher.getAuthTag().toString('base64');

    const fullCiphertext = ciphertext + ':' + tag;

    const publicKeyObj = crypto.createPublicKey({
      key: clientJwk,
      format: 'jwk'
    });

    const encryptedAesKey = crypto.publicEncrypt(
      {
        key: publicKeyObj,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256'
      },
      aesKey
    );

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

function decryptPacketFromClient(pkg) {
  if (!pkg || typeof pkg !== 'object' || !pkg.k || !pkg.i || !pkg.d) {
    return pkg;
  }
  try {
    const encryptedKeyBuf = Buffer.from(pkg.k, 'base64');
    const privateKeyObj = crypto.createPrivateKey({
      key: serverKeyPair.privateKey,
      format: 'jwk'
    });

    const aesKey = crypto.privateDecrypt(
      {
        key: privateKeyObj,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256'
      },
      encryptedKeyBuf
    );

    const parts = pkg.d.split(':');
    const ciphertextBuf = Buffer.from(parts[0], 'base64');
    const tagBuf = Buffer.from(parts[1], 'base64');
    const ivBuf = Buffer.from(pkg.i, 'base64');

    const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, ivBuf);
    decipher.setAuthTag(tagBuf);
    let decrypted = decipher.update(ciphertextBuf, null, 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
  } catch (err) {
    console.error('Server decryption error:', err);
    return pkg;
  }
}

function emitToSocketEncrypted(targetSocket, eventName, dataObj) {
  const clientJwk = clientKeysMap.get(targetSocket.id);
  if (clientJwk) {
    targetSocket.emit(eventName, encryptPacketForClient(dataObj, clientJwk));
  } else {
    targetSocket.emit(eventName, dataObj);
  }
}

function broadcastEncrypted(ioServer, eventName, dataObj) {
  for (const [id, skt] of ioServer.sockets.sockets) {
    const clientJwk = clientKeysMap.get(id);
    if (clientJwk) {
      skt.emit(eventName, encryptPacketForClient(dataObj, clientJwk));
    } else {
      skt.emit(eventName, dataObj);
    }
  }
}

const DEFAULT_LAYOUT_V1 = ["0 $A", "500 $A", "500 $A", "750 $A", "750 $A", "750 $A", "1.000 $A", "1.000 $A", "1.000 $A", "1.500 $A", "2.500 $A", "5.000 $A"];
const TABLE1_V2 = ["1", "1", "1", "2", "2", "2", "2", "3", "3", "3", "3", "4"];
const TABLE2_V2 = ["1", "1", "1", "2", "2", "2", "2", "3", "3", "3", "4", "5"];

let gameState = {
  showMHC: true,
  currentActiveRound: 1,
  globalTotalPrize: 0,
  currentMoneyLayoutV1: [...DEFAULT_LAYOUT_V1],
  currentMoneyLayoutV2: [...TABLE1_V2],
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

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const io = new SocketIOServer(server, {
    cors: { origin: "*" }
  });

  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.use(express.static(__dirname));

  app.get('/controller', (req, res) => {
    res.sendFile(path.join(__dirname, 'Controller.html'));
  });

  app.get('/screen', (req, res) => {
    res.sendFile(path.join(__dirname, 'Screen.html'));
  });

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  io.on('connection', (socket) => {
    socket.on('register-client-key', (data) => {
      if (data && data.jwk) {
        clientKeysMap.set(socket.id, data.jwk);
      }
      socket.emit('init-handshake', { jwk: serverPublicKeyJwk });
      emitToSocketEncrypted(socket, 'sync-full-state', gameState);
    });

    socket.on('trigger-sound', (rawPayload) => {
      const data = decryptPacketFromClient(rawPayload);
      if (data && data.sound === 'stop_all') {
        broadcastEncrypted(io, 'stop-all-sounds-client', {});
      } else {
        broadcastEncrypted(io, 'play-sound-client', data);
      }
    });
      
    socket.on('update-game-state', (rawPayload) => {
      const updatedState = decryptPacketFromClient(rawPayload);
      if (updatedState && typeof updatedState === 'object') {
        gameState = { ...gameState, ...updatedState };
        broadcastEncrypted(io, 'sync-full-state', gameState);
      }
    });

    socket.on('consume-action', () => {
      gameState.lastAction = '';
      broadcastEncrypted(io, 'sync-full-state', gameState);
    });

    socket.on('trigger-popup', (rawPayload) => {
      const msg = decryptPacketFromClient(rawPayload);
      broadcastEncrypted(io, 'display-popup', msg);
    });

    socket.on('disconnect', () => {
      clientKeysMap.delete(socket.id);
    });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
