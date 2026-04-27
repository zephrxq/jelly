import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { exec } from "child_process";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "http://localhost:5173",
        methods: ["GET", "POST"]
    }
})

const roomData = {};
const apiKey = "AIzaSyBGEXCV6tyMe6jFLpY0ZzIDC-gORmM2NQU";

io.on("connection", (socket) => {
    let currentRoom = "";
    let searchResults = {};

    socket.on("join-room", (roomId, callback) => {
        if(!Object.keys(roomData).includes(roomId)) {
            callback({
                status: "fail",
                reason: "Room not found!"
            })
            return;
        } else if(socket.rooms.length > 1) {
            callback({
                status: "fail",
                reason: "You are already in a room."
            })
            return;
        }

        currentRoom = roomId;
        socket.join(roomId);
        socket.to(roomId).emit("room-joined");

        callback({
            status: "success",
            roomData: roomData[roomId]
        })
    })

    socket.on("create-room", (callback) => {
        currentRoom = socket.id.toUpperCase();
        roomData[currentRoom] = {
            owner: nickname,
            queue: [],
            song: {}
        }
    })
    
    socket.on("add-song", (songData, callback) => {
        roomData[currentRoom].queue.push(songData);
    })

    socket.on("search", (query, callback) => {
        const params = new URLSearchParams({
            part: "snippet",
            q: query,
            type: "video",
            maxResults: 10,
            order: "viewCount",
            key: apiKey
        })

        fetch(`https://www.googleapis.com/youtube/v3/search?${params}`)
            .then(res => res.json())
            .then(data => {
                searchResults = data;
                callback(searchResults.items);
            })
    })
})

httpServer.listen(3000);