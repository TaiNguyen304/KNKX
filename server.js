import express from 'express';
import http from 'http';
import path from 'path';
import crypto from 'crypto'; // Module crypto để mã hóa
import { fileURLToPath } from 'url';
import { Server as SocketIOServer } from 'socket.io';
import { createServer as createViteServer } from 'vite';

// Tự động tương thích cả khi chạy bằng ESM (node direct/tsx) lẫn CJS (esbuild bundle trên Render)
const getDirname = () => {
    try {
        if (typeof __dirname !== 'undefined') return __dirname;
        return path.dirname(fileURLToPath(import.meta.url));
    } catch {
        return process.cwd();
    }
};

const currentDir = getDirname();

const PORT = process.env.PORT || 3000;
const CONTROLLER_SECRET_KEY = "KNKX_ADMIN_SECRET_2026";

// KEY BẢO MẬT CHỈ TỒN TẠI TRÊN SERVER (KHÔNG BAO GIỜ GỬI XUỐNG SCREEN)
const AES_SECRET_KEY = process.env.SCREEN_SECRET_KEY || "KNKX_SERVER_AES_KEY_SECRET_32B!"; 

/**
 * Mã hóa AES-256 bất kỳ giá trị nào thành chuỗi mã hóa không thể đọc bằng F12
 */
function encryptAES(data) {
    if (data === undefined || data === null) return data;
    try {
        const text = typeof data === 'object' ? JSON.stringify(data) : String(data);
        const iv = crypto.randomBytes(16); // Tạo Vector khởi tạo ngẫu nhiên
        const key = Buffer.from(AES_SECRET_KEY.padEnd(32).slice(0, 32)); // Đảm bảo đúng 32 bytes
        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
        
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        return iv.toString('hex') + ':' + encrypted;
    } catch (err) {
        return "ENC_ERROR";
    }
}

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
 * Mã hóa toàn bộ dữ liệu nhạy cảm trước khi gửi tới Screen.
 * Bất kỳ giá trị nào chưa đến giờ hiển thị hoặc đáp án bí mật đều bị MÃ HÓA AES-256.
 */
function sanitizeStateForScreen(state) {
    if (!state) return state;

    const displayClasses = Array.isArray(state.displayClasses) ? state.displayClasses : [];
    
    // Cờ hiển thị từ Controller
    const isTopicShown = displayClasses.includes('show-topic');
    const isQuestionShown = displayClasses.includes('show-question');
    const isR1ResultShown = displayClasses.includes('show-r1-result'); 
    const isR2AnsShown = displayClasses.includes('show-r2-ans');       
    const isR2ResultShown = displayClasses.includes('show-r2-result'); 
    
    const activeQ = state.activeQuestion;

    // 1. Mã hóa câu hỏi, chủ đề và ĐÁP ÁN ĐÚNG
    let sanitizedRoundData = {
        topic: (isTopicShown && state.currentRoundData?.topic) ? state.currentRoundData.topic : encryptAES(state.currentRoundData?.topic || "HIDDEN_TOPIC"),
        A: { text: encryptAES("LOCKED") },
        B: { text: encryptAES("LOCKED") },
        C: { text: encryptAES("LOCKED") }
    };

    if (state.currentRoundData) {
        ['A', 'B', 'C'].forEach((qKey) => {
            if (state.currentRoundData[qKey]) {
                const isThisActiveQ = (activeQ === qKey) && isQuestionShown;
                const rawObj = state.currentRoundData[qKey];

                sanitizedRoundData[qKey] = {
                    // Nếu chưa mở câu hỏi => Mã hóa text. Khi mở rồi => Hiện text
                    text: isThisActiveQ && rawObj.text ? rawObj.text : encryptAES(rawObj.text || "LOCKED_TEXT"),
                    
                    // LUÔN LUÔN mã hóa AES thuộc tính correct và excelAnsRaw
                    correct: encryptAES(rawObj.correct),
                    excelAnsRaw: encryptAES(rawObj.excelAnsRaw)
                };
            }
        });
    }

    // 2. Mã hóa trạng thái nút Đúng/Sai Vòng 1
    let sanitizedR1Ctrl = {
        trueBtnClass: isR1ResultShown ? (state.round1CtrlState?.trueBtnClass || "ans-btn") : encryptAES(state.round1CtrlState?.trueBtnClass || "SECRET_STATUS"),
        falseBtnClass: isR1ResultShown ? (state.round1CtrlState?.falseBtnClass || "ans-btn") : encryptAES(state.round1CtrlState?.falseBtnClass || "SECRET_STATUS")
    };

    // 3. Mã hóa đáp án Vòng 2
    let sanitizedR2Ctrl = {
        text: (isR2AnsShown || isR2ResultShown) ? (state.round2CtrlState?.text || "") : encryptAES(state.round2CtrlState?.text || "SECRET_ANSWER"),
        backgroundImage: state.round2CtrlState?.backgroundImage || "url('Whitebar2.png')",
        textColor: state.round2CtrlState?.textColor || "#000000",
        isCorrect: encryptAES(state.round2CtrlState?.isCorrect) // Mã hóa trạng thái đúng/sai
    };

    // 4. Trả về state với toàn bộ dữ liệu thô đã bị mã hóa AES
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

        // Mã hóa 100% kho đề và dữ liệu Excel thô sang dạng AES Ciphertext vô nghĩa
        excelRawDataV1: encryptAES(state.excelRawDataV1 || "RAW_DATA"),
        excelRawDataV2: encryptAES(state.excelRawDataV2 || "RAW_DATA"),
        round1TopicsData: encryptAES(state.round1TopicsData || "TOPICS_DATA"),
        round2TopicsData: encryptAES(state.round2TopicsData || "TOPICS_DATA")
    };
}

function broadcastState() {
    io.to('controller').emit('sync-full-state', gameState);
    const screenState = sanitizeStateForScreen(gameState);
    io.to('screen').emit('sync-full-state', screenState);
}

io.on('connection', (socket) => {
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

        if (!socket.rooms.has('controller')) {
            return;
        }

        // Loại bỏ trường hợp Controller vô tình đẩy lại chuỗi đã bị encrypt lên Server
        ['round1TopicsData', 'round2TopicsData', 'excelRawDataV1', 'excelRawDataV2'].forEach(key => {
            if (typeof updatedState[key] === 'string' && updatedState[key].includes(':')) {
                delete updatedState[key];
            }
        });

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

// Chấp nhận tất cả các biến thể đường dẫn có hoặc không có đuôi .html, phân biệt/không phân biệt hoa thường
app.get(['/controller', '/controller.html', '/Controller.html'], (_req, res) => {
    res.sendFile(path.join(currentDir, 'Controller.html'));
});

app.get(['/screen', '/screen.html', '/Screen.html'], (_req, res) => {
    res.sendFile(path.join(currentDir, 'Screen.html'));
});

// Phục vụ tất cả tài nguyên tĩnh ở thư mục gốc (ảnh, nhạc, JS...)
app.use(express.static(currentDir));

async function startServer() {
    if (process.env.NODE_ENV !== 'production') {
        try {
            const vite = await createViteServer({
                server: { middlewareMode: true },
                appType: 'spa',
            });
            app.use(vite.middlewares);
        } catch (e) {
            // bỏ console.log thừa
        }
    } else {
        const distPath = path.join(currentDir, 'dist');
        app.use(express.static(distPath));
        
        // Fallback an toàn: Chỉ trả về index.html nếu file tồn tại
        app.get('*', (req, res, next) => {
            const indexPath = path.join(distPath, 'index.html');
            res.sendFile(indexPath, (err) => {
                if (err) {
                    // Nếu không có index.html trong dist, fallback về thư mục gốc
                    res.sendFile(path.join(currentDir, 'Controller.html'), (e) => {
                        if (e) next();
                    });
                }
            });
        });
    }

    server.listen(PORT, '0.0.0.0', () => {
        // Server listening on designated port
    });
}

startServer();