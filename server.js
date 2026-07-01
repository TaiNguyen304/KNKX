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
    res.sendFile(path.join(__dirname, 'Controller.html'));
});

app.get('/screen', (req, res) => {
    res.sendFile(path.join(__dirname, 'Screen.html'));
});

// Điều hướng mặc định nếu vào trang chủ
app.get('/', (req, res) => {
    res.send('Hệ thống đang chạy! Truy cập /controller hoặc /screen để bắt đầu.');
});

// Biến lưu trữ trạng thái Game toàn cục để đồng bộ ngay khi Screen/Controller kết nối hoặc thay đổi
let gameState = {
    showMHC: true,
    currentActiveRound: 1,
    globalTotalPrize: 0,
    currentMoneyLayoutV1: ["0 $A", "100 $A", "200 $A", "500 $A", "500 $A", "500 $A", "1.000 $A", "1.000 $A", "1.000 $A", "1.500 $A", "2.500 $A", "5.000 $A"],
    currentMoneyLayoutV2: ["1", "1", "1", "2", "2", "2", "2", "3", "3", "3", "3", "4"],
    isSo5Checked: false,
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
    usedChoices: { A: false, B: false, C: false },
    // Lưu thông tin index vòng để đồng bộ danh sách đề
    currentRoundIndexR1: 0,
    currentRoundIndexR2: 0,
    round1TopicsData: [],
    round2TopicsData: []
};

io.on('connection', (socket) => {
    // Khi có bất kỳ client nào kết nối (Screen hoặc các Controller), gửi trạng thái hiện tại ngay lập tức
    socket.emit('sync-full-state', gameState);

    // Lắng nghe lệnh điều khiển âm thanh (bao gồm cả phát nhạc và dừng nhạc)
    socket.on('trigger-sound', (data) => {
        if (data && data.sound === 'stop_all') {
            io.emit('stop-all-sounds-client');
        } else {
            io.emit('play-sound-client', data);
        }
    });
    
    // Lắng nghe sự kiện đồng bộ từ các Controller gửi lên
    socket.on('update-game-state', (updatedState) => {
        // Ghi đè các thuộc tính thay đổi vào gameState tổng của server
        gameState = { ...gameState, ...updatedState };
        // Dùng io.emit thay vì socket.broadcast.emit để đồng bộ lại giao diện cho TẤT CẢ các máy Controller đang mở và Screen
        io.emit('sync-full-state', gameState);
    });

    // Sự kiện bắn hiệu ứng popup nhanh cho Screen và Controller
    socket.on('trigger-popup', (msg) => {
        io.emit('display-popup', msg);
    });
});

// Khởi chạy server
http.listen(PORT, '0.0.0.0', () => {
    console.log(`Server đang chạy tại port: ${PORT}`);
});