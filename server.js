// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" } // Allow any origin for simplicity
});

const rooms = {}; // Store room state

function getRandomCard() {
  const val = Math.floor(Math.random() * 13) + 1;
  return val > 10 ? 10 : val;
}

function calculateTotal(hand) {
  return hand.reduce((sum, card) => sum + card, 0);
}

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('joinRoom', (roomCode) => {
    socket.join(roomCode);

    if (!rooms[roomCode]) {
      rooms[roomCode] = {
        players: [],
        currentTurn: 0,
        deck: [],
        gameOver: false,
      };
    }

    const room = rooms[roomCode];
    if (room.players.length >= 2) {
      socket.emit('roomFull');
      return;
    }

    const player = {
      id: socket.id,
      hand: [getRandomCard(), getRandomCard()],
      stand: false
    };

    room.players.push(player);

    io.to(roomCode).emit('update', {
      players: room.players.map(p => ({
        id: p.id,
        hand: p.hand,
        total: calculateTotal(p.hand),
        stand: p.stand
      })),
      currentTurn: room.players[room.currentTurn].id
    });
  });

  socket.on('hit', (roomCode) => {
    const room = rooms[roomCode];
    const player = room.players.find(p => p.id === socket.id);
    if (!player || room.gameOver) return;

    player.hand.push(getRandomCard());

    if (calculateTotal(player.hand) > 21) {
      room.gameOver = true;
      io.to(roomCode).emit('gameOver', {
        loser: socket.id,
        reason: 'bust'
      });
      return;
    }

    io.to(roomCode).emit('update', {
      players: room.players.map(p => ({
        id: p.id,
        hand: p.hand,
        total: calculateTotal(p.hand),
        stand: p.stand
      })),
      currentTurn: room.players[room.currentTurn].id
    });
  });

  socket.on('stand', (roomCode) => {
    const room = rooms[roomCode];
    const playerIndex = room.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1) return;

    room.players[playerIndex].stand = true;

    if (room.players.every(p => p.stand)) {
      room.gameOver = true;
      const totals = room.players.map(p => {
        const total = calculateTotal(p.hand);
        return total > 21 ? 0 : total;
      });

      let winner;
      if (totals[0] === totals[1]) {
        winner = null;
      } else {
        winner = totals[0] > totals[1] ? room.players[0].id : room.players[1].id;
      }

      io.to(roomCode).emit('gameOver', {
        winner,
        totals
      });
    } else {
      room.currentTurn = (room.currentTurn + 1) % 2;
      io.to(roomCode).emit('update', {
        players: room.players.map(p => ({
          id: p.id,
          hand: p.hand,
          total: calculateTotal(p.hand),
          stand: p.stand
        })),
        currentTurn: room.players[room.currentTurn].id
      });
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    for (const [roomCode, room] of Object.entries(rooms)) {
      room.players = room.players.filter(p => p.id !== socket.id);
      if (room.players.length === 0) {
        delete rooms[roomCode];
      } else {
        io.to(roomCode).emit('update', {
          players: room.players,
          currentTurn: room.players[0].id
        });
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
