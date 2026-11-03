import express from "express";
import dotenv from "dotenv";
dotenv.config();

import { createServer } from "http";
import { Server } from "socket.io";
import { toNodeHandler } from "better-auth/node";
import cors from "cors";
import { parse } from "tinyduration";
import { auth } from "./auth.js";
import { userManager } from "./userManager.js";
import { roomManager } from "./roomManager.js";
import { exec } from "child_process";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: process.env.CLIENT_URL,
        methods: ["GET", "POST"],
        credentials: true
    }
})

const apiKey = process.env.API_KEY;

app.set("trust proxy", 1);

async function getSession(headers) {
    const session = await auth.api.getSession({
        headers: headers
    })

    if(!session) {
        return null;
    }

    if(!userManager.hasUser(session.user.id)) {
        userManager.createUser(session.user);
    }

    return session;
}

io.use(async (socket, next) => {
    const session = await getSession(socket.request.headers);
    
    if(!session) {
        return next(new Error("Forbidden"));
    }

    socket.data.user = session.user;

    next();
})

io.on("connection", (socket) => {
    const userId = socket.data.user?.id;

    if(!userId) {
        socket.disconnect(true);
        return;
    }

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
        room = roomManager.createRoom(user, io);

        io.in(`user:${user.id}`).socketsJoin(`room:${room.id}`);
        io.to(`room:${room.id}`).emit("state", room.snapshot());

        callback({
            status: "success"
        })
    })

    socket.on("leave-room", () => {
        user = userManager.getUser(userId);

        if(!user.room) {
            return;
        }

        room = roomManager.getRoom(user.room.id);
        
        user.leaveRoom(room);
        io.in(`user:${user.id}`).socketsLeave(`room:${room.id}`);
        io.to(`room:${room.id}`).emit("state", room.snapshot());
        socket.to(`user:${user.id}`).emit("leave-room");
    })

    socket.on("add-song", (songId, callback) => {
        user = userManager.getUser(userId);
        room = roomManager.getRoom(user.room.id);

        if(!user.room) {
            return;
        }

        const params = new URLSearchParams({
            part: "snippet,contentDetails",
            id: songId,
            key: apiKey
        })
        
        const execCmd = `yt-dlp ${songId} --print '{\"id\":%(id)j,\"title\":%(title)j,\"artist\":%(artist,uploader)j,\"duration\":%(duration*1000)s,\"thumbnail\":%(thumbnails.-1.url)j}' --cookies "/server/cookies.txt"`;

        exec(execCmd, (error, stdout, stderr) => {
            if(error) return callback({ status: "fail", reason: "Failed to fetch video data" });

            try {
                const songData = JSON.parse(stdout.trim());
                room.dispatch({
                    type: "ADD_SONG",
                    song: songData
                })
            } catch(error) {
                callback({
                    status: "fail",
                    reason: "Failed to parse video data"
                })
            }
        })
    })

    socket.on("toggle-pause", () => {
        user = userManager.getUser(userId);
        room = roomManager.getRoom(user.room.id);

        if(!user.room) {
            return;
        }

        room.dispatch({
            type: "TOGGLE_PAUSE"
        })
    })

    socket.on("skip-next", async () => {
        user = userManager.getUser(userId);
        room = roomManager.getRoom(user.room.id);

        if(!user.room) {
            return;
        }

        room.dispatch({
            type: "SKIP_NEXT"
        })
    })

    socket.on("skip-back", async () => {
        user = userManager.getUser(userId);
        room = roomManager.getRoom(user.room.id);

        if(!user.room) {
            return;
        }

        room.dispatch({
            type: "SKIP_BACK"
        })
    })

    socket.on("search", (query, callback) => {
        user = userManager.getUser(userId);
        room = roomManager.getRoom(user.room.id);

        if(!user.room) {
            return;
        }

        const params = new URLSearchParams({
            part: "snippet",
            q: query,
            type: "video",
            maxResults: 50,
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

    socket.on("seek", (time) => {
        user = userManager.getUser(userId);
        room = roomManager.getRoom(user.room.id);

        if(!user.room) {
            return;
        }

        room.dispatch({
            type: "SEEK",
            time: time
        })
    })

    socket.on("send-message", async (message, callback) => {
        user = userManager.getUser(userId);
        room = roomManager.getRoom(user.room.id);

        if(!user.room) {
            return;
        }

        await room.handleChat(user, message);
        
        io.to(`room:${room.id}`).emit("messages", room.snapshot().messages);
        callback();
    })
})

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

app.use((req, res, next) => {
    console.log({
        ip: req.ip,
        method: req.method,
        path: req.originalUrl,
        timestamp: new Date().toISOString()
    })

    next();
})

app.all("/api/auth/{*any}", toNodeHandler(auth.handler));
app.use("/songs", express.static("./songs"));
app.use(express.json());
httpServer.listen(3000);