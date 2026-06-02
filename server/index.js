import express from "express";
import dotenv from "dotenv";
dotenv.config();

import { createServer } from "http";
import { Server } from "socket.io";
import { parse } from "tinyduration";
import { toNodeHandler, fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth.js";
import cors from "cors";
import { userManager } from "./userManager.js";
import { roomManager } from "./roomManager.js";

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
    
    socket.data.user = session.user;

    if(!session) {
        return next(new Error("Forbidden"));
    }

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
        room = roomManager.getRoom(user.room.id);
        
        user.leaveRoom(room);
        io.in(`user:${user.id}`).socketsLeave(`room:${room.id}`);
        io.to(`room:${room.id}`).emit("state", room.snapshot());
        io.to(`user:${user.id}`).emit("state", {});
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
                io.to(`room:${room.id}`).emit("song-added", songData);
            })
    })

    socket.on("toggle-pause", () => {
        user = userManager.getUser(userId);
        room = roomManager.getRoom(user.room.id);

        room.togglePause();
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
app.use("/songs", express.static("./songs"));
app.use(express.json());
httpServer.listen(3000);