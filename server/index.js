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
    // implement some shit to check room
    const roomId = "1";
    socket.join(roomId);
    io.to(roomId).emit("connection");
    socket.emit(roomData[roomId]);
})