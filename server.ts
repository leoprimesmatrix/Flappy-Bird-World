import express from "express";
import { createServer as createViteServer } from "vite";
import { Server } from "socket.io";
import http from "http";

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: "*",
    },
  });

  const PORT = 3000;

  // Simple matchmaking and room logic
  let waitingPlayers: { socket: any, name: string }[] = [];
  let matchTimeout: NodeJS.Timeout | null = null;
  const rooms = new Map();

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join_matchmaking", (data) => {
      const playerName = data?.name || "Guest";
      if (!waitingPlayers.find(p => p.socket.id === socket.id)) {
        waitingPlayers.push({ socket, name: playerName });
      }
      
      if (waitingPlayers.length >= 4) {
        startMatch();
      } else if (waitingPlayers.length >= 2 && !matchTimeout) {
        matchTimeout = setTimeout(startMatch, 3000);
      }
      
      // Broadcast waiting count to all waiting players
      waitingPlayers.forEach(p => {
        p.socket.emit("waiting_for_players", { count: waitingPlayers.length });
      });
    });

    function startMatch() {
      if (matchTimeout) {
        clearTimeout(matchTimeout);
        matchTimeout = null;
      }
      if (waitingPlayers.length < 2) return;
      
      const roomPlayers = waitingPlayers.splice(0, 4);
      const roomId = "room_" + Date.now();
      const seed = Math.random();
      const playerNames = roomPlayers.map(p => p.name);
      
      roomPlayers.forEach((p, index) => {
        p.socket.join(roomId);
        p.socket.emit("match_found", { 
          roomId, 
          seed, 
          playerIndex: index, 
          totalPlayers: roomPlayers.length,
          playerNames 
        });
      });
      
      rooms.set(roomId, { 
        players: roomPlayers.map(p => p.socket.id), 
        aliveCount: roomPlayers.length,
        readyCount: 0,
        state: {} 
      });

      let count = 3;
      io.to(roomId).emit("countdown", count);
      const interval = setInterval(() => {
        count--;
        if (count > 0) {
          io.to(roomId).emit("countdown", count);
        } else if (count === 0) {
          io.to(roomId).emit("countdown", "GO!");
        } else {
          clearInterval(interval);
          io.to(roomId).emit("start_game");
        }
      }, 1000);
    }

    socket.on("player_update", (data) => {
      // data: { roomId, y, velocity, alive, score, angle, playerIndex }
      socket.to(data.roomId).emit("opponent_update", { id: socket.id, ...data });
    });

    socket.on("player_died", (data) => {
      socket.to(data.roomId).emit("opponent_died", { id: socket.id, playerIndex: data.playerIndex });
      const room = rooms.get(data.roomId);
      if (room) {
        room.aliveCount--;
        if (room.aliveCount <= 0) {
          io.to(data.roomId).emit("all_players_died");
        }
      }
    });

    socket.on("player_ready_restart", (data) => {
      const room = rooms.get(data.roomId);
      if (room) {
        room.readyCount++;
        io.to(data.roomId).emit("player_ready_update", { readyCount: room.readyCount, total: room.players.length });
        if (room.readyCount >= room.players.length) {
          room.aliveCount = room.players.length;
          room.readyCount = 0;
          const seed = Math.random();
          io.to(data.roomId).emit("restart_match", { seed });
          
          let count = 3;
          io.to(data.roomId).emit("countdown", count);
          const interval = setInterval(() => {
            count--;
            if (count > 0) {
              io.to(data.roomId).emit("countdown", count);
            } else if (count === 0) {
              io.to(data.roomId).emit("countdown", "GO!");
            } else {
              clearInterval(interval);
              io.to(data.roomId).emit("start_game");
            }
          }, 1000);
        }
      }
    });

    socket.on("disconnect", () => {
      waitingPlayers = waitingPlayers.filter((p) => p.socket.id !== socket.id);
      
      // Find room and handle disconnect
      for (const [roomId, room] of rooms.entries()) {
        const playerIndex = room.players.indexOf(socket.id);
        if (playerIndex !== -1) {
          // Notify others
          socket.to(roomId).emit("opponent_disconnected", { playerIndex });
          
          // Treat as died
          room.aliveCount--;
          if (room.aliveCount <= 0) {
            io.to(roomId).emit("all_players_died");
          }
          
          // Remove from room
          room.players.splice(playerIndex, 1);
          
          // If room empty, delete it
          if (room.players.length === 0) {
            rooms.delete(roomId);
          } else {
            // Check if remaining players are ready to restart
            if (room.readyCount >= room.players.length && room.players.length > 0) {
              room.aliveCount = room.players.length;
              room.readyCount = 0;
              const seed = Math.random();
              io.to(roomId).emit("restart_match", { seed });
              
              let count = 3;
              io.to(roomId).emit("countdown", count);
              const interval = setInterval(() => {
                count--;
                if (count > 0) {
                  io.to(roomId).emit("countdown", count);
                } else if (count === 0) {
                  io.to(roomId).emit("countdown", "GO!");
                } else {
                  clearInterval(interval);
                  io.to(roomId).emit("start_game");
                }
              }, 1000);
            }
          }
          break;
        }
      }
      
      console.log("User disconnected:", socket.id);
    });
  });

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
