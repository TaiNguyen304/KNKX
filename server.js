import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server as SocketIOServer } from 'socket.io';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
    cors: { origin: "*" }
});

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

/**
 * Encrypts and sanitizes gameState before broadcasting to Screen clients.
 * ANY hidden data, raw excel data, full topic datasets, and secret answers
 * are ALWAYS replaced with a single "🐧" symbol, regardless of content length.
 */
function sanitizeStateForScreen(state) {
    if (!state) return state;

    const sanitized = JSON.parse(JSON.stringify(state));

    // 1. Redact all background datasets and raw Excel imports completely to a single "🐧"
    sanitized.excelRawDataV1 = "🐧";
    sanitized.excelRawDataV2 = "🐧";
    sanitized.round1TopicsData = "🐧";
    sanitized.round2TopicsData = "🐧";

    const displayClasses = sanitized.displayClasses || [];
    const isTopicShown = displayClasses.includes('show-topic');
    const isQuestionShown = displayClasses.includes('show-question');
    const isR2AnsShown = displayClasses.includes('show-r2-ans');
    const isR2ResultShown = displayClasses.includes('show-r2-result');
    const activeQ = sanitized.activeQuestion;

    // 2. Sanitize currentRoundData
    if (sanitized.currentRoundData) {
        if (!isTopicShown) {
            sanitized.currentRoundData.topic = "🐧";
        }

        ['A', 'B', 'C'].forEach((qKey) => {
            if (sanitized.currentRoundData[qKey]) {
                const isThisActiveQ = (activeQ === qKey) && isQuestionShown;

                // Secret answer boolean & raw excel answer are ALWAYS encrypted to "🐧" for Screen
                sanitized.currentRoundData[qKey].correct = "🐧";
                sanitized.currentRoundData[qKey].excelAnsRaw = "🐧";

                // Question text is encrypted to "🐧" unless this question is actively opened on screen
                if (!isThisActiveQ) {
                    sanitized.currentRoundData[qKey].text = "🐧";
                }
            }
        });
    }

    // 3. Sanitize Round 2 answer state
    if (sanitized.round2CtrlState) {
        sanitized.round2CtrlState.isCorrect = "🐧";

        if (!isR2AnsShown && !isR2ResultShown) {
            sanitized.round2CtrlState.text = "🐧";
        }
    }

    // 4. Sanitize Round 1 controller selection status
    if (sanitized.round1CtrlState && sanitized.lastAction !== 'revealResult1') {
        sanitized.round1CtrlState.selectedStatusAdmin = "🐧";
    }

    return sanitized;
}

function broadcastState() {
    io.to('controller').emit('sync-full-state', gameState);
    const screenState = sanitizeStateForScreen(gameState);
    io.to('screen').emit('sync-full-state', screenState);
}

io.on('connection', (socket) => {
    socket.on('register-role', (role) => {
        if (role === 'controller') {
            socket.leave('screen');
            socket.join('controller');
            socket.emit('sync-full-state', gameState);
        } else {
            socket.leave('controller');
            socket.join('screen');
            socket.emit('sync-full-state', sanitizeStateForScreen(gameState));
        }
    });

    socket.on('trigger-sound', (data) => {
        if (data && data.sound === 'stop_all') {
            io.emit('stop-all-sounds-client');
        } else {
            io.emit('play-sound-client', data);
        }
    });
    
    socket.on('update-game-state', (updatedState) => {
        if (!updatedState) return;

        // Prevent controller from accidentally overwriting server datasets with sanitized "🐧" strings
        if (updatedState.round1TopicsData === "🐧") delete updatedState.round1TopicsData;
        if (updatedState.round2TopicsData === "🐧") delete updatedState.round2TopicsData;
        if (updatedState.excelRawDataV1 === "🐧") delete updatedState.excelRawDataV1;
        if (updatedState.excelRawDataV2 === "🐧") delete updatedState.excelRawDataV2;

        gameState = { ...gameState, ...updatedState };
        broadcastState();
    });

    socket.on('consume-action', () => {
        gameState.lastAction = '';
        broadcastState();
    });

    socket.on('trigger-popup', (msg) => {
        io.emit('display-popup', msg);
    });
});

app.get('/controller', (_req, res) => {
    res.sendFile(path.join(__dirname, 'Controller.html'));
});

app.get('/screen', (_req, res) => {
    res.sendFile(path.join(__dirname, 'Screen.html'));
});

app.use(express.static(__dirname));

async function startServer() {
    if (process.env.NODE_ENV !== 'production') {
        try {
            const vite = await createViteServer({
                server: { middlewareMode: true },
                appType: 'spa',
            });
            app.use(vite.middlewares);
        } catch (e) {
            console.log('Vite middleware notice:', e.message);
        }
    } else {
        const distPath = path.join(__dirname, 'dist');
        app.use(express.static(distPath));
        app.get('*', (_req, res) => {
            res.sendFile(path.join(distPath, 'index.html'));
        });
    }

    server.listen(PORT, '0.0.0.0', () => {
        console.log(`Server đang chạy tại port: ${PORT}`);
    });
}

startServer();
