const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: { origin: "*" }
});
const path = require('path');

const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

app.get('/controller', (req, res) => {
    res.sendFile(path.join(__dirname, 'Controller.html'));
});

app.get('/screen', (req, res) => {
    res.sendFile(path.join(__dirname, 'Screen.html'));
});

app.get('/', (req, res) => {
    res.send('Hệ thống đang chạy! Truy cập /controller hoặc /screen để bắt đầu.');
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

io.on('connection', (socket) => {
    socket.emit('sync-full-state', gameState);

    socket.on('trigger-sound', (data) => {
        if (data && data.sound === 'stop_all') {
            io.emit('stop-all-sounds-client');
        } else {
            io.emit('play-sound-client', data);
        }
    });
    
    socket.on('update-game-state', (updatedState) => {
        gameState = { ...gameState, ...updatedState };
        io.emit('sync-full-state', gameState);
    });

    // SỬA TẠI ĐÂY: Xóa action cũ và đồng bộ ngay trạng thái sạch cho tất cả các bên
    socket.on('consume-action', () => {
        gameState.lastAction = '';
        io.emit('sync-full-state', gameState);
    });

    socket.on('trigger-popup', (msg) => {
        io.emit('display-popup', msg);
    });
});

http.listen(PORT, '0.0.0.0', () => {
    console.log(`Server đang chạy tại port: ${PORT}`);
});