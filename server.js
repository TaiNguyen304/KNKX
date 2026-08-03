import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server as SocketIOServer } from 'socket.io';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const CONTROLLER_SECRET_KEY = "KNKX_ADMIN_SECRET_2026";

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
 * ANY hidden data, raw excel data, full topic datasets, secret answers, and unannounced 
 * result statuses are ALWAYS replaced with a single "🐧" symbol or default safe values.
 */
function sanitizeStateForScreen(state) {
    if (!state) return state;

    const displayClasses = Array.isArray(state.displayClasses) ? state.displayClasses : [];
    
    // Cờ hiển thị từ Controller
    const isTopicShown = displayClasses.includes('show-topic');
    const isQuestionShown = displayClasses.includes('show-question');
    const isR1ResultShown = displayClasses.includes('show-r1-result'); // Cờ hiển thị kết quả Vòng 1
    const isR2AnsShown = displayClasses.includes('show-r2-ans');       // Cờ hiển thị đáp án Vòng 2
    const isR2ResultShown = displayClasses.includes('show-r2-result'); // Cờ hiển thị kết quả Vòng 2
    
    const activeQ = state.activeQuestion;

    // 1. Xử lý câu hỏi và chủ đề
    let sanitizedRoundData = {
        topic: isTopicShown && state.currentRoundData?.topic ? state.currentRoundData.topic : "🐧",
        A: { text: "🐧" },
        B: { text: "🐧" },
        C: { text: "🐧" }
    };

    if (state.currentRoundData) {
        ['A', 'B', 'C'].forEach((qKey) => {
            if (state.currentRoundData[qKey]) {
                const isThisActiveQ = (activeQ === qKey) && isQuestionShown;
                sanitizedRoundData[qKey] = {
                    // Chỉ gửi text câu hỏi khi đang active và bấm show-question
                    text: isThisActiveQ && state.currentRoundData[qKey].text ? state.currentRoundData[qKey].text : "🐧"
                    // KHÔNG BAO GIỜ bao gồm 'correct' hay 'excelAnsRaw'
                };
            }
        });
    }

    // 2. Xử lý nút Đúng/Sai Vòng 1
    // Ẩn hoàn toàn trạng thái Đúng/Sai cho đến khi bấm nút công bố (isR1ResultShown)
    let sanitizedR1Ctrl = {
        trueBtnClass: (isR1ResultShown && state.round1CtrlState?.trueBtnClass) ? state.round1CtrlState.trueBtnClass : "ans-btn",
        falseBtnClass: (isR1ResultShown && state.round1CtrlState?.falseBtnClass) ? state.round1CtrlState.falseBtnClass : "ans-btn"
    };

    // 3. Xử lý đáp án Vòng 2
    let sanitizedR2Ctrl = {
        text: ((isR2AnsShown || isR2ResultShown) && state.round2CtrlState?.text) ? state.round2CtrlState.text : "🐧",
        backgroundImage: state.round2CtrlState?.backgroundImage || "url('Whitebar2.png')",
        textColor: state.round2CtrlState?.textColor || "#000000"
    };

    // 4. Trả về state an toàn cho Screen client
    return {
        showMHC: !!state.showMHC,
        currentActiveRound: state.currentActiveRound || 1,
        globalTotalPrize: state.globalTotalPrize || 0,
        currentMoneyLayoutV1: state.currentMoneyLayoutV1 || [],
        currentMoneyLayoutV2: state.currentMoneyLayoutV2 || [],
        isSo5Checked: !!state.isSo5Checked,
        moneyAnimationChecked: !!state.moneyAnimationChecked,
        moneyGridStateV1: state.moneyGridStateV1 || {},
        moneyGridStateV2: state.moneyGridStateV2 || {},
        symbolBoxesStateV1: state.symbolBoxesStateV1 || {},
        symbolBoxesStateV2: state.symbolBoxesStateV2 || {},
        currentRoundData: sanitizedRoundData,
        displayClasses: displayClasses,
        activeQuestion: state.activeQuestion || null,
        activeSideSign: state.activeSideSign || null,
        round1CtrlState: sanitizedR1Ctrl,
        round2CtrlState: sanitizedR2Ctrl,
        usedChoices: state.usedChoices || { A: false, B: false, C: false },
        currentRoundIndexR1: state.currentRoundIndexR1 || 0,
        currentRoundIndexR2: state.currentRoundIndexR2 || 0,
        lastAction: state.lastAction || '',

        // Mã hóa toàn bộ dữ liệu Excel/Chủ đề thô thành "🐧"
        excelRawDataV1: "🐧",
        excelRawDataV2: "🐧",
        round1TopicsData: "🐧",
        round2TopicsData: "🐧"
    };
}

function broadcastState() {
    io.to('controller').emit('sync-full-state', gameState);
    const screenState = sanitizeStateForScreen(gameState);
    io.to('screen').emit('sync-full-state', screenState);
}

io.on('connection', (socket) => {
    // Sockets join 'screen' room by default on initial connection
    socket.join('screen');
    socket.emit('sync-full-state', sanitizeStateForScreen(gameState));

    socket.on('register-role', (data) => {
        let role = typeof data === 'object' ? data.role : data;
        let key = typeof data === 'object' ? data.key : null;

        if (role === 'controller' && key === CONTROLLER_SECRET_KEY) {
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

        // Security enforcement: only authorized controller sockets can push game state updates
        if (!socket.rooms.has('controller')) {
            return;
        }

        // Prevent controller from accidentally overwriting server datasets with sanitized "🐧" strings
        if (updatedState.round1TopicsData === "🐧") delete updatedState.round1TopicsData;
        if (updatedState.round2TopicsData === "🐧") delete updatedState.round2TopicsData;
        if (updatedState.excelRawDataV1 === "🐧") delete updatedState.excelRawDataV1;
        if (updatedState.excelRawDataV2 === "🐧") delete updatedState.excelRawDataV2;

        gameState = { ...gameState, ...updatedState };
        broadcastState();
    });

    socket.on('consume-action', () => {
        if (!socket.rooms.has('controller')) return;
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