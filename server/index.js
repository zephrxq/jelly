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
        origin: "*",
        methods: ["GET", "POST"]
    }
})

const rooms = new Map();
const timeouts = new Map();

dotenv.config();
const apiKey = process.env.API_KEY;

const START_OFFSET = 0;
const EMPTY_SONG = {
    id: "",
    title: "",
    artist: "",
    duration: "",
    thumbnail: "",
    paused: true
}

io.on("connection", (socket) => {
    let currentRoomId = "";
    let currentRoomData = "";
    let searchResults = {};
    let nickname = "zeph"; // implement some kinda login system

    socket.on("join-room", (roomId, callback) => {
        if(!rooms.has(roomId)) {
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
        currentRoomData = rooms.get(currentRoomId);
        socket.join(roomId);

        callback({
            status: "success",
            roomData: rooms.get(roomId)
        })
    })

    socket.on("create-room", (callback) => {
        currentRoomId = socket.id.toUpperCase();

        socket.join(currentRoomId);
        rooms.set(currentRoomId, {
            owner: nickname,
            queue: [],
            song: EMPTY_SONG
        })
        currentRoomData = rooms.get(currentRoomId);

        callback({
            status: "success",
            roomData: currentRoomData
        })
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
                if(!data.items || data.items.length == 0) {
                    callback({
                        status: "fail",
                        reason: "Invalid video"
                    })
                    return;
                }

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

                getYoutubeLink(song.id)
                    .then((songUrl) => {
                        songData.url = songUrl;
                        currentRoomData.queue.push(songData);

                        if(!currentRoomData.song.id) {
                            playSong(currentRoomId, currentRoomData);
                        }
                    })
            })
    })

    socket.on("toggle-pause", () => {
        if(!currentRoomData || !currentRoomData.song.id) {
            return;
        }
        
        togglePause(currentRoomId, currentRoomData);
    })

    socket.on("skip-next", () => {
        if(!currentRoomData || !currentRoomData.queue.length) {
            return;
        }
        
        endSong(currentRoomId, currentRoomData);
        playSong(currentRoomId, currentRoomData);
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
            .then((res) => res.json())
            .then((data) => {
                searchResults = data;
                callback(searchResults.items);
            })
    })
})

function endSong(roomId, roomData) {
    roomData.song = EMPTY_SONG;;
    
    io.to(roomId).emit("end-song", roomData);
}

function playSong(roomId, roomData) {
    if(roomData.queue.length == 0) {
        return;
    }
    
    roomData.song = roomData.queue.shift();
    
    const timeNow = Date.now();

    roomData.song.timeStart = timeNow + START_OFFSET;
    roomData.song.timeEnd = roomData.song.timeStart + roomData.song.duration;

    io.to(roomId).emit("play-song", roomData);

    timeouts.set(roomId, setTimeout(() => {
        endSong(roomId, roomData);
        playSong(roomId, roomData);
    }, roomData.song.duration + START_OFFSET))
}

function togglePause(roomId, roomData) {
    clearTimeout(timeouts.get(roomId));

    roomData.song.paused = !roomData.song.paused;

    if(roomData.song.paused) {
        let timeNow = Date.now();
        roomData.song.timePause = timeNow;
    } else {
        let timeNow = Date.now();
        roomData.song.timeStart += (timeNow - roomData.song.timePause);
        roomData.song.timeEnd = roomData.song.timeStart + roomData.song.duration;
        
        timeouts.set(roomId, setTimeout(() => {
            endSong(roomId, roomData);
            playSong(roomId, roomData);
        }, roomData.song.timeEnd - timeNow))
    }
    
    io.to(roomId).emit("toggle-pause", roomData);
}

function getYoutubeLink(songId) {
    let execCmd = ["./server/yt-dlp", "-f", "bestaudio", "-g", "-q", "--no-warnings", `https://youtube.com/watch?v=${songId}`];


    return new Promise((resolve, reject) => {
        execFile("python", execCmd, (error, stdout, stderr) => {
            if(error) {
                reject();
            } else {
                resolve(stdout.trim());
            }
        })
    })
}

httpServer.listen(3000);