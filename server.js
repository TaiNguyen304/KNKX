const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.static(path.join(__dirname)));

let currentGameState = {
    currentActiveRound: 1,
    globalTotalPrize: 0,
    currentMoneyLayoutV1: ["0 $A", "100 $A", "200 $A", "500 $A", "500 $A", "500 $A", "1.000 $A", "1.000 $A", "1.000 $A", "1.500 $A", "2.500 $A", "5.000 $A"],
    currentMoneyLayoutV2: ["1", "1", "1", "2", "2", "2", "2", "3", "3", "3", "3", "4"],
    moneyGridStateV1: {},
    moneyGridStateV2: {},
    symbolBoxesStateV1: {},
    symbolBoxesStateV2: {},
    currentRoundData: { topic: "TỪ CHỦ ĐỀ 1", A: { text: 'Trống', correct: true }, B: { text: 'Trống', correct: true }, C: { text: 'Trống', correct: true } },
    displayClasses: ['hide-money'],
    activeQuestion: null,
    round1CtrlState: { selectedStatusAdmin: null, trueBtnClass: "ans-btn", falseBtnClass: "ans-btn" },
    round2CtrlState: { text: 'ĐÁP ÁN', isCorrect: true, backgroundImage: "url('Whitebar2.png')", textColor: "#000" },
    usedChoices: { A: false, B: false, C: false },
    round1TopicsData: [],
    round2TopicsData: [],
    currentRoundIndexR1: 0,
    currentRoundIndexR2: 0,
    showMHC: true,
    lastAction: '',
    openedSymbol: null,
    isSo5Checked: false,
    excelRawDataV2: null
};

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.emit('sync-full-state', currentGameState);

    socket.on('update-game-state', (newState) => {
        console.log('State update from Controller:', newState.lastAction);
        currentGameState = { ...currentGameState, ...newState };
        io.emit('sync-full-state', currentGameState);
    });

    socket.on('trigger-sound', (data) => {
        if (data.sound === 'stop_all') {
            io.emit('stop-all-sounds-client');
        } else {
            io.emit('play-sound-client', { sound: data.sound });
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
