import express from "express";
import dotenv from "dotenv";
dotenv.config();

import { createServer } from "http";
import { Server } from "socket.io";
import { execFile, spawn } from "child_process";
import { parse } from "tinyduration";
import { toNodeHandler } from "better-auth/node";
import { customAlphabet } from "nanoid";
import { auth } from "./auth.js";
import cors from "cors";
import { existsSync } from "fs";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: process.env.CLIENT_URL,
        methods: ["GET", "POST"],
        credentials: true
    }
})
const nanoid = customAlphabet("1234567890abcdef", 8);
const apiKey = process.env.API_KEY;

const EMPTY_SONG = {
    id: "",
    title: "Nothing playing",
    artist: "Unknown artist",
    thumbnail: "",
    paused: true,
    duration: 0
}

class Room {
    constructor(id, owner) {
        this.owner = owner;
        this.queue = [];
        this.history = [];
        this.members = [];
        this.song = EMPTY_SONG;
        this.songUrl = null;
        this.status = "idle";
        this.startTime = null;
        this.pauseTime = null;
        this.id = id;
    }

    snapshot() {
        return {
            owner: this.owner,
            queue: this.queue,
            history: this.history,
            members: this.members,
            song: this.song,
            status: this.status,
            startTime: this.startTime,
            id: this.id
        }
    }

    isSongFinished() {
        if(!this.startTime || !this.song?.id || this.status !== "playing") return false;

        return Date.now() - this.startTime >= this.song.duration;
    }

    checkIfFinished(){
        if(this.status === "playing" && this.isSongFinished()) {
            this.endSong();
            this.playNext();
            return true;
        }

        return false;
    }
    
    addSong(song) {
        this.queue.push(song);

        if(!this.song.id) {
            this.playNext();
        }
    }
    
    playLast() {
        if(this.history.length == 0) {
            return;
        }

        if(this.song.id) {
            this.queue.push(this.song);
        }

        const song = this.history.pop();

        this.song = song;
        this.status = "playing";
        this.startTime = Date.now();
        this.pauseTime = null;
    }

    playNext() {
        if(this.queue.length == 0) {
            return;
        }

        if(this.song.id) {
            this.history.push(this.song);
        }

        const song = this.queue.shift();
        
        this.song = song;
        this.status = "playing";
        this.startTime = Date.now();
        this.pauseTime = null;
    }

    endSong() {
        this.song = EMPTY_SONG;
        this.status = "idle";
        this.startTime = null;
        this.pauseTime = null;
        this.setSongUrl(null);
    }
    
    skipNext() {
        this.playNext();
    }

    skipBack() {
        this.playLast();
    }

    togglePause() {
        if(!this.song.id) {
            return;
        }
        
        if(this.status === "playing") {
            this.pauseTime = Date.now();
            this.status = "paused";
        } else {
            this.startTime += Date.now() - this.pauseTime;
            this.status = "playing";
        }
    }

    joinRoom(user) {
        if(!this.members.find(member => member.id === user.id)) {
            this.members.push(user);
        }
    }

    leaveRoom(user) {
        const memberIndex = this.members.findIndex(member => member.id === user.id)
        if(memberIndex != -1) {
            this.members.splice(memberIndex, 1);
        }
    }

    setSongUrl(url) {
        if(!this.song.id) {
            return;
        }

        this.songUrl = url;
    }

    getSongUrl() {
        return this.songUrl;
    }
}

class RoomManager {
    constructor() {
        this.rooms = new Map();
    }
    
    createRoom(owner) {
        const id = nanoid();
        const room = new Room(id, owner.data);

        this.rooms.set(id, room);
        owner.joinRoom(room);
        
        return room;
    }

    hasRoom(id) {
        return this.rooms.has(id)
    }

    getRoom(id) {
        return this.rooms.get(id)
    }
}

class User {
    constructor(data) {
        this.room = null;
        this.data = data;
        this.id = data.id;
    }

    joinRoom(room) {
        this.room = room;
        room.joinRoom(this.data);
    }

    leaveRoom(room) {
        this.room = null;
        room.leaveRoom(this.data);
    }
}

class UserManager {
    constructor() {
        this.users = new Map();
    }

    createUser(data) {
        const user = new User(data);

        this.users.set(data.id, user);

        return user;
    }

    hasUser(id) {
        return this.users.has(id)
    }

    getUser(id) {
        return this.users.get(id);
    }
}

const roomManager = new RoomManager();
const userManager = new UserManager();

async function authMiddleware(socket, next) {
    const session = await auth.api.getSession({
        headers: socket.request.headers
    })

    if(!session) {
        socket.data.user = null;
        return;
    }
    
    if(!userManager.hasUser(session.user.id)) {
        userManager.createUser(session.user);
    }

    socket.data.user = session.user;

    next();
}

io.use(authMiddleware);

io.on("connection", (socket) => {
    const userId = socket.data.user.id;

    if(!userId) return;

    let user = userManager.getUser(userId);
    let room = roomManager.getRoom(user.room?.id);
    socket.join(`user:${user.id}`);

    if(room) {
        socket.join(`room:${room.id}`);
        io.to(`room:${room.id}`).emit("state", room.snapshot());
    }
    
    socket.on("join-room", async (id, callback) => {
        if(!roomManager.hasRoom(id)) {
            callback({
                status: "fail",
                reason: "Room not found!"
            })
            return;
        }

        user = userManager.getUser(userId);
        room = roomManager.getRoom(id);
        user.joinRoom(room);

        io.in(`user:${user.id}`).socketsJoin(`room:${room.id}`);
        io.to(`room:${room.id}`).emit("state", room.snapshot());

        callback({
            status: "success"
        })
    })

    socket.on("create-room", async (callback) => {
        user = userManager.getUser(userId);
        room = roomManager.createRoom(user);
        io.in(`user:${user.id}`).socketsJoin(`room:${room.id}`);
        io.to(`room:${room.id}`).emit("state", room.snapshot());

        callback({
            status: "success"
        })
    })

    socket.on("leave-room", () => {
        user = userManager.getUser(userId);
        room = roomManager.getRoom(user.room.id);
        
        user.leaveRoom(room);
        io.in(`user:${user.id}`).socketsLeave(`room:${room.id}`);
        io.to(`room:${room.id}`).emit("state", room.snapshot());
        io.to(`user:${room.id}`).emit("state", {});
    })

    socket.on("add-song", (songId, callback) => {
        user = userManager.getUser(userId);
        room = roomManager.getRoom(user.room.id);

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

                room.addSong(songData);
                io.to(`room:${room.id}`).emit("state", room.snapshot());
                getYoutubeLink(songId)
                .then((url) => {
                    room.setSongUrl(url);
                    io.to(`room:${room.id}`).emit("song-ready");
                })
            })
    })

    socket.on("toggle-pause", () => {
        user = userManager.getUser(userId);
        room = roomManager.getRoom(user.room.id);

        room.togglePause();
        io.to(`room:${room.id}`).emit("state", room.snapshot());
    })

    socket.on("skip-next", () => {
        user = userManager.getUser(userId);
        room = roomManager.getRoom(user.room.id);

        room.skipNext();
        io.to(`room:${room.id}`).emit("state", room.snapshot());
    })

    socket.on("skip-back", () => {
        user = userManager.getUser(userId);
        room = roomManager.getRoom(user.room.id);

        room.skipBack();
        io.to(`room:${room.id}`).emit("state", room.snapshot());
    })

    socket.on("search", (query, callback) => {
        user = userManager.getUser(userId);
        room = roomManager.getRoom(user.room.id);

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
                callback(data.items);
            })
    })
})

function getYoutubeLink(songId) {
    return new Promise((resolve, reject) => {
        let execCmd = ["./server/yt-dlp", "-f", "bestaudio", "-g", "-q", "--no-warnings", `https://youtube.com/watch?v=${songId}`, "--cookies", "./server/cookies.txt"];

        execFile("python", execCmd, (error, stdout, stderr) => {
            if(error) {
                reject(error);
            } else {
                resolve(stdout);
            }
        })
    })
}

setInterval(() => {
    for(const room of roomManager.rooms.values()) {
        const changed = room.checkIfFinished();

        if(changed) {
            io.to(`room:${room.id}`).emit("state", room.snapshot());
        }
    }
}, 500)

app.use(cors({
    origin: process.env.CLIENT_URL,
    credentials: true
}))
app.all("/api/auth/{*any}", toNodeHandler(auth.handler));

app.get("/stream/:id", (req, res) => {
    res.setHeader("Content-Type", "audio/mpeg");

    const room = roomManager.getRoom(req.params.id);
    const ffmpegCmd = ["-ss", (Date.now() - room.snapshot().startTime) / 1000, "-i", room.getSongUrl(), "-vn", "-c:a", "libmp3lame", "-b:a", "128k", "-f", "mp3", "pipe:1"];
    const ffmpeg = spawn("ffmpeg", ffmpegCmd);

    ffmpeg.stdout.pipe(res);

    req.on("close", () => {
        ffmpeg.kill("SIGKILL");
    })
})

app.use(express.json());
httpServer.listen(3000);