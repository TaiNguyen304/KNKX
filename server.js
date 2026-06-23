const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: { origin: "*" }
});
const path = require('path');

const PORT = process.env.PORT || 3000;

// Cấu hình serve các file tĩnh (hình ảnh bg1.png, sss.png,...) nằm cùng thư mục
app.use(express.static(__dirname));

// Routing theo yêu cầu hệ thống
app.get('/controller', (req, res) => {
    res.sendFile(path.join(__dirname, 'controller.html'));
});

app.get('/screen', (req, res) => {
    res.sendFile(path.join(__dirname, 'screen.html'));
});

// Điều hướng mặc định nếu vào trang chủ
app.get('/', (req, res) => {
    res.send('Hệ thống đang chạy! Truy cập /controller hoặc /screen để bắt đầu.');
});

// Biến lưu trữ trạng thái Game toàn cục để đồng bộ ngay khi Screen reload
let gameState = {
    currentActiveRound: 1,
    globalTotalPrize: 0,
    currentMoneyLayoutV1: ["0 $A", "100 $A", "200 $A", "500 $A", "500 $A", "500 $A", "1.000 $A", "1.000 $A", "1.000 $A", "1.500 $A", "2.500 $A", "5.000 $A"],
    currentMoneyLayoutV2: ["1", "1", "1", "2", "2", "2", "2", "3", "3", "3", "3", "4"],
    moneyGridState: {},   // Lưu các ô tiền bị 'closed' hoặc 'selected'
    symbolBoxesState: {}, // Lưu các ô ký hiệu bị 'closed' hoặc 'selected'
    currentRoundData: {
        topic: "TỪ CHỦ ĐỀ 1",
        A: { text: 'Câu hỏi mẫu A', correct: true, excelAnsRaw: '' },
        B: { text: 'Câu hỏi mẫu B', correct: false, excelAnsRaw: '' },
        C: { text: 'Câu hỏi mẫu C', correct: true, excelAnsRaw: '' }
    },
    displayClasses: [], // Các class hiệu ứng trên game-board ('hide-money', 'show-topic'...)
    activeQuestion: null, // 'A', 'B', 'C' hoặc null
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
    usedChoices: { A: false, B: false, C: false }
};

io.on('connection', (socket) => {
    // Khi có client kết nối (Screen hoặc Controller), gửi trạng thái hiện tại ngay lập tức
    socket.emit('sync-full-state', gameState);

    // Lắng nghe sự kiện đồng bộ từ Controller gửi lên
    socket.on('update-game-state', (updatedState) => {
        gameState = { ...gameState, ...updatedState };
        // Phát lại cho toàn bộ các client khác (đặc biệt là Screen)
        socket.broadcast.emit('sync-full-state', gameState);
    });

    // Sự kiện bắn hiệu ứng popup nhanh cho Screen
    socket.on('trigger-popup', (msg) => {
        socket.broadcast.emit('display-popup', msg);
    });
});

http.listen(PORT, () => {
    console.log(`Server đang chạy tại port: ${PORT}`);
});