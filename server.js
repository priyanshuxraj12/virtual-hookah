const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

const rooms = new Map();

io.on("connection", (socket) => {
  socket.on("join-room", ({ roomId, name }) => {
    roomId = String(roomId || "").trim().toUpperCase().slice(0, 32);
    name = String(name || "Guest").trim().slice(0, 24) || "Guest";

    if (!roomId) {
      socket.emit("room-error", "Please enter a room code.");
      return;
    }

    let room = rooms.get(roomId);
    if (!room) {
      room = new Set();
      rooms.set(roomId, room);
    }

    if (room.size >= 2) {
      socket.emit("room-error", "This room already has two people.");
      return;
    }

    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.name = name;
    room.add(socket.id);

    const peers = [...room].filter((id) => id !== socket.id);

    socket.emit("room-joined", {
      roomId,
      name,
      isInitiator: peers.length === 0,
      peerCount: room.size
    });

    if (peers.length > 0) {
      io.to(peers[0]).emit("peer-joined", {
        name,
        peerCount: room.size
      });
    }
  });

  // Generic WebRTC signaling messages.
  socket.on("signal", ({ roomId, data }) => {
    if (!socket.data.roomId || socket.data.roomId !== roomId) return;
    socket.to(roomId).emit("signal", data);
  });

  socket.on("puff", ({ roomId, intensity }) => {
    if (!socket.data.roomId || socket.data.roomId !== roomId) return;
    socket.to(roomId).emit("remote-puff", {
      intensity: Math.max(0.2, Math.min(1, Number(intensity) || 0.7)),
      name: socket.data.name || "Guest"
    });
  });

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room) return;

    room.delete(socket.id);
    socket.to(roomId).emit("peer-left");

    if (room.size === 0) rooms.delete(roomId);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Virtual Hookah running on http://localhost:${PORT}`);
});