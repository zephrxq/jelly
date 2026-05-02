import express from "express";
import dotenv from "dotenv";
import { createServer } from "http";
import { Server } from "socket.io";
import { exec } from "child_process";
import { parse } from "tinyduration";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "http://localhost:5173",
        methods: ["GET", "POST"]
    }
})

const roomsData = {};

dotenv.config();
const apiKey = process.env.API_KEY;

const START_OFFSET = 0;

io.on("connection", (socket) => {
    let currentRoomId = "";
    let searchResults = {};
    let nickname = "zeph"; // implement some kinda login system

    socket.on("join-room", (roomId, callback) => {
        if(!Object.keys(roomsData).includes(roomId)) {
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

        currentRoomId = roomId;
        socket.join(roomId);

        callback({
            status: "success",
            roomData: roomsData[roomId]
        })
    })

    socket.on("create-room", (callback) => {
        currentRoomId = socket.id.toUpperCase();
        socket.join(currentRoomId);

        roomsData[currentRoomId] = {
            owner: nickname,
            queue: [],
            song: {}
        }
        
        callback({
            status: "success",
            roomData: roomsData[currentRoomId]
        })

        console.log(roomsData)
    })
    
    socket.on("add-song", (songId, callback) => {
        const params = new URLSearchParams({
            part: "snippet,contentDetails",
            id: songId,
            key: apiKey
        })

        fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`)
            .then((res) => res.json())
            .then((data) => {
                const song = data.items[0];
                const songDuration = parse(song.contentDetails.duration);
                const songData = {
                    id: song.id,
                    title: song.snippet.title,
                    artist: song.snippet.channelTitle,
                    duration: ((songDuration.hours || 0) * 3600 + (songDuration.minutes || 0) * 60 + (songDuration.seconds || 0)) * 1000, // ms
                    thumbnail:
                        song.snippet.thumbnails.maxres?.url ||
                        song.snippet.thumbnails.standard?.url ||
                        song.snippet.thumbnails.high?.url ||
                        song.snippet.thumbnails.medium?.url ||
                        song.snippet.thumbnails.default?.url
                }
                roomsData[currentRoomId].queue.push(songData);

                if(Object.keys(roomsData[currentRoomId].song) == 0) {
                    playSong(currentRoomId, roomsData[currentRoomId]);
                }
            })
    })

    socket.on("search", (query, callback) => {
        const params = new URLSearchParams({
            part: "snippet",
            q: query,
            type: "video",
            maxResults: 10,
            order: "relevance",
            videoCategoryId: 10,
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

function endSong(roomId, roomData) {
    roomData.song = {};
    roomsData[roomId] = roomData;
}

function playSong(roomId, roomData) {
    if(roomData.queue.length == 0) {
        return;
    }
    
    roomData.song = roomData.queue.shift();

    let execCmd = `python ./server/yt-dlp -f bestaudio -g -q --no-warnings https://youtube.com/watch?v=${roomData.song.id}`;

    exec(execCmd, (error, stdout, stderr) => {
        if(error) {
            return console.log(error);
        }

        const timeNow = Date.now();
        roomData.song.url = stdout.trim();
        roomData.song.timeStart = timeNow + START_OFFSET;
        roomData.song.timeEnd = roomData.song.timeStart + roomData.song.duration;
        
        io.to(roomId).emit("play-song", roomData);

        roomsData[roomId] = roomData;

        setTimeout(() => {
            endSong(roomId, roomData);
            playSong(roomId, roomData);
        }, roomData.song.duration + START_OFFSET)
    })
}

httpServer.listen(3000);