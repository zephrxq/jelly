import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  }
})

const roomData = {
    "1": {
        song: "hi"
    }
}

io.on("connection", (socket) => {
  socket.on("join-room", (roomId, callback) => {
    if(!Object.keys(roomData).includes(roomId)) {
      callback({
        status: "fail",
        reason: "Room not found!"
      })
      return;
    }
    
    socket.join(roomId);
    io.to(roomId).emit("room-join");
    
    callback({
      status: "success",
      roomData: roomData[roomId]
    })
  })
})

httpServer.listen(3000);