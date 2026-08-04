import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import * as jose from 'jose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: "*" }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

app.get('/jose.browser.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'jose.browser.js'));
});

app.get('/controller', (req, res) => {
    res.sendFile(path.join(__dirname, 'Controller.html'));
});

app.get('/screen', (req, res) => {
    res.sendFile(path.join(__dirname, 'Screen.html'));
});

app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="vi">
        <head>
            <meta charset="UTF-8">
            <title>Khắc Nhập Khắc Xuất - Hệ Thống Trò Chơi</title>
            <style>
                body { font-family: sans-serif; background: #0b0d1b; color: #fff; text-align: center; padding-top: 50px; }
                h1 { color: #39ff14; }
                a { color: #00ffff; font-size: 20px; margin: 0 15px; text-decoration: none; border: 1px solid #00ffff; padding: 10px 20px; border-radius: 8px; display: inline-block; margin-top: 20px; }
                a:hover { background: #00ffff; color: #000; }
            </style>
        </head>
        <body>
            <h1>Hệ Thống Khắc Nhập Khắc Xuất Đã Sẵn Sàng</h1>
            <p>Vui lòng chọn trang điều khiển hoặc màn hình hiển thị sân khấu:</p>
            <div>
                <a href="/controller" target="_blank">Trang Điều Khiển (Controller)</a>
                <a href="/screen" target="_blank">Màn Hình Hướng Sân Khấu (Screen)</a>
            </div>
        </body>
        </html>
    `);
});

let gameState = {
    showMHC: true,
    currentActiveRound: 1,
    globalTotalPrize: 0,
    currentMoneyLayoutV1: ["0 $A", "100 $A", "200 $A", "500 $A", "500 $A", "500 $A", "1.000 $A", "1.000 $A", "1.000 $A", "1.500 $A", "2.500 $A", "5.000 $A"],
    currentMoneyLayoutV2: ["1", "1", "1", "2", "2", "2", "2", "3", "3", "3", "3", "4"],
    isSo5Checked: false,
    moneyAnimationChecked: false,
    moneyGridStateV1: {},
    moneyGridStateV2: {},
    symbolBoxesStateV1: {},
    symbolBoxesStateV2: {},
    currentRoundData: {
        topic: "CHỦ ĐỀ 1.1",
        A: { text: 'Câu hỏi mẫu A', correct: true, excelAnsRaw: 'Đúng' },
        B: { text: 'Câu hỏi mẫu B', correct: false, excelAnsRaw: 'Sai' },
        C: { text: 'Câu hỏi mẫu C', correct: true, excelAnsRaw: 'Đúng' }
    },
    displayClasses: ['hide-money'],
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

// Tạo bộ lọc dữ liệu an toàn cho màn hình Screen (bảo mật tuyệt đối thông tin câu hỏi/đáp án)
function buildScreenPayload(state) {
    const curQuestion = state.activeQuestion;
    
    // Xây dựng object currentRoundData an toàn cho Screen
    let safeRoundData = null;
    if (state.currentRoundData) {
        safeRoundData = {
            topic: state.currentRoundData.topic || ""
        };

        ['A', 'B', 'C'].forEach(ch => {
            const rawChoice = state.currentRoundData[ch];
            if (rawChoice) {
                // Chỉ gửi nội dung câu hỏi nếu câu hỏi đó đang được kích hoạt mở
                const isThisQuestionActive = (curQuestion === ch);
                safeRoundData[ch] = {
                    text: isThisQuestionActive ? (rawChoice.text || "") : "",
                    excelAnsRaw: "" // Luôn ẩn đáp án gốc trên Screen ngoại trừ khi được hiển thị kết quả
                };
            }
        });
    }

    // Bảo vệ thông tin đáp án vòng 2 trừ khi đã được admin ấn lệnh tiết lộ
    let safeRound2CtrlState = { ...state.round2CtrlState };
    if (!state.displayClasses || (!state.displayClasses.includes('show-r2-ans') && !state.displayClasses.includes('show-r2-result'))) {
        safeRound2CtrlState.text = "";
    }

    return {
        showMHC: state.showMHC,
        currentActiveRound: state.currentActiveRound,
        globalTotalPrize: state.globalTotalPrize,
        currentMoneyLayoutV1: state.currentMoneyLayoutV1,
        currentMoneyLayoutV2: state.currentMoneyLayoutV2,
        isSo5Checked: state.isSo5Checked,
        moneyAnimationChecked: state.moneyAnimationChecked,
        moneyGridStateV1: state.moneyGridStateV1,
        moneyGridStateV2: state.moneyGridStateV2,
        symbolBoxesStateV1: state.symbolBoxesStateV1,
        symbolBoxesStateV2: state.symbolBoxesStateV2,
        currentRoundData: safeRoundData,
        displayClasses: state.displayClasses,
        activeQuestion: state.activeQuestion,
        activeSideSign: state.activeSideSign,
        round1CtrlState: state.round1CtrlState,
        round2CtrlState: safeRound2CtrlState,
        usedChoices: state.usedChoices,
        lastAction: state.lastAction
        // Tuyệt đối KHÔNG bao giờ gửi excelRawDataV1, excelRawDataV2, round1TopicsData, round2TopicsData sang Screen!
    };
}

// Gửi payload đã được mã hóa JWE tới socket
async function emitEncryptedState(socket) {
    try {
        const payloadToEncrypt = (socket.clientType === 'screen')
            ? buildScreenPayload(gameState)
            : gameState;

        if (socket.publicKey) {
            const jsonStr = JSON.stringify(payloadToEncrypt);
            const jwe = await new jose.CompactEncrypt(new TextEncoder().encode(jsonStr))
                .setProtectedHeader({ alg: 'RSA-OAEP-256', enc: 'A256GCM' })
                .encrypt(socket.publicKey);

            socket.emit('sync-full-state', { jwe });
        } else {
            // Trường hợp socket chưa đăng ký khoá công khai
            socket.emit('sync-full-state', { jwe: null, pendingKey: true });
        }
    } catch (err) {
        console.error('Lỗi khi mã hóa JWE payload:', err);
    }
}

// Phát lại trạng thái tới tất cả các kết nối
async function broadcastState() {
    const sockets = await io.fetchSockets();
    for (const socket of sockets) {
        await emitEncryptedState(socket);
    }
}

io.on('connection', (socket) => {
    socket.on('register-client-key', async (data) => {
        try {
            if (data && data.publicKeyJwk) {
                socket.publicKey = await jose.importJWK(data.publicKeyJwk, 'RSA-OAEP-256');
                socket.clientType = data.clientType || 'unknown';
            }
        } catch (err) {
            console.error('Lỗi đăng ký khóa công khai:', err);
        }
        await emitEncryptedState(socket);
    });

    socket.on('trigger-sound', (data) => {
        if (data && data.sound === 'stop_all') {
            io.emit('stop-all-sounds-client');
        } else {
            io.emit('play-sound-client', data);
        }
    });

    socket.on('update-game-state', async (updatedState) => {
        gameState = { ...gameState, ...updatedState };
        await broadcastState();
    });

    socket.on('consume-action', async () => {
        gameState.lastAction = '';
        await broadcastState();
    });

    socket.on('trigger-popup', (msg) => {
        io.emit('display-popup', msg);
    });
});

httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server Khắc Nhập Khắc Xuất đang chạy tại port: ${PORT}`);
});
