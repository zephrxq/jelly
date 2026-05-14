import express from "express";
import dotenv from "dotenv";
import { createServer } from "http";
import { Server } from "socket.io";
import { execFile } from "child_process";
import { parse } from "tinyduration";
import { toNodeHandler } from "better-auth/node";
import { nanoid } from "nanoid";
import { auth } from "./auth.js";
import cors from "cors";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "http://localhost:5173",
        methods: ["GET", "POST"],
        credentials: true
    }
})

dotenv.config();
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
        this.members = [];
        this.song = EMPTY_SONG;
        this.status = "idle";
        this.startTime = null;
        this.pauseTime = null;
        this.id = id;
    }

    snapshot() {
        return {
            owner: this.owner,
            queue: this.queue,
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
    
    playNext() {
        const song = this.queue.shift();
        
        if(!song) {
            this.song = EMPTY_SONG;
            this.status = "idle";
            this.startTime = null;
            this.pauseTime = null;
            return;
        }

        this.song = song;
        this.status = "playing";
        this.startTime = Date.now();
        this.pauseTime = null;
    }

    endSong() {
        this.song = EMPTY_SONG;
        this.status = "idle";
    }
    
    skipNext() {
        this.endSong();
        this.playNext();
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
}

class RoomManager {
    constructor() {
        this.rooms = new Map();
    }
    
    createRoom(owner) {
        const id = nanoid(8);
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
    }

    joinRoom(room) {
        this.room = room;
        room.joinRoom(this.data);
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
    const userData = socket.data.user;

    if(!userData) return;

    const user = userManager.getUser(userData.id);
    let room = roomManager.getRoom(user.room?.id);

    socket.join(`user:${user.id}`);

    if(room) {
        socket.join(`room:${room.id}`);
        io.to(`user:${user.id}`).emit("state", room.snapshot());
    }
    
    socket.on("join-room", async (id, callback) => {
        if(!roomManager.hasRoom(id)) {
            callback({
                status: "fail",
                reason: "Room not found!"
            })
            return;
        }

        room = roomManager.getRoom(id);
        user.joinRoom(room);

        io.in(`user:${user.id}`).socketsJoin(`room:${room.id}`);
        io.to(`user:${user.id}`).emit("state", room.snapshot());

        callback({
            status: "success"
        })
    })

    socket.on("create-room", async (callback) => {
        room = roomManager.createRoom(user);

        io.in(`user:${user.id}`).socketsJoin(`room:${room.id}`);
        io.to(`user:${user.id}`).emit("state", room.snapshot());

        callback({
            status: "success"
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

                        room.addSong(songData);
                        io.to(`room:${room.id}`).emit("state", room.snapshot());
                    })
            })
    })

    socket.on("toggle-pause", () => {
        room.togglePause();
        io.to(`room:${room.id}`).emit("state", room.snapshot());
    })

    socket.on("skip-next", () => {
        room.skipNext();
        io.to(`room:${room.id}`).emit("state", room.snapshot());
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
                callback(data.items);
            })
    })
})

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

setInterval(() => {
    for(const room of roomManager.rooms.values()) {
        const changed = room.checkIfFinished();

        if(changed) {
            io.to(`room:${room.id}`).emit("state", room.snapshot());
        }
    }
}, 500)

app.use(cors({
    origin: "http://localhost:5173",
    credentials: true
}))
app.all("/api/auth/{*any}", toNodeHandler(auth.handler));
app.use(express.json());
httpServer.listen(3000);