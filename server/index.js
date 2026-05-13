import express from "express";
import dotenv from "dotenv";
import { createServer } from "http";
import { Server } from "socket.io";
import { execFile } from "child_process";
import { parse } from "tinyduration";
import { createStore } from "zustand/vanilla";
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

const rooms = new Map();
const timeouts = new Map();

// temporary, move to db
const users = new Map();

function createRoom(id, owner) {
    const roomStore = createStore((set, get) => ({
        owner,
        queue: [],
        members: [],
        song: EMPTY_SONG,
        status: "idle",
        startTime: 0,
        position: 0,
        id,

        getPosition: () => {
            const state = get();

            if(state.status !== "playing") {
                return state.position;
            }

            return state.position + Date.now() - state.startTime;
        },

        dispatchEvent: (event) => {
            switch(event.type) {
                case "add-song": {
                    get().applyEvent(event);

                    if(get().song.id == "") {
                        get().dispatchEvent({ type: "play-next" });
                    }

                    break;
                }

                case "play-next": {
                    const song = get().queue[0];
                    
                    if(!song) return;

                    get().applyEvent({
                        type: "play-next",
                        song
                    })

                    timeouts.set(id, setTimeout(() => {
                        get().dispatchEvent({ type: "skip-next" });
                    }, song.duration))
                    
                    break;
                }

                case "end-song": {
                    clearTimeout(timeouts.get(id));
                    get().applyEvent(event);

                    break;
                }

                case "skip-next": {
                    get().dispatchEvent({ type: "end-song" });
                    get().dispatchEvent({ type: "play-next" });

                    break;
                }

                case "toggle-pause": {
                    if(get().song.id == "") {
                        return;
                    }
                    
                    get().applyEvent(event);
                    
                    if(get().status == "paused") {
                        clearTimeout(timeouts.get(id));
                    } else if(get().status == "playing") {
                        timeouts.set(id, setTimeout(() => {
                            get().dispatchEvent({ type: "skip-next" });
                        }, get().song.duration - get().getPosition()))
                    }
                    break;
                }

                case "join-room": {
                    get().applyEvent(event);

                    break;
                }
            }
        },

        applyEvent: (event) => {
            set((state) => {
                switch(event.type) {
                    case "add-song": {
                        return {
                            queue: [...state.queue, event.song]
                        }
                    }
                    
                    case "end-song": {
                        return {
                            song: EMPTY_SONG,
                            status: "idle"
                        }
                    }

                    case "play-next": {
                        return {
                            queue: state.queue.slice(1),
                            song: event.song,
                            status: "playing",
                            startTime: Date.now(),
                            position: 0
                        }
                    }

                    case "toggle-pause": {
                        if(state.status == "playing") {
                            return {
                                status: "paused",
                                position: get().getPosition()
                            }
                        }
                        
                        return {
                            status: "playing",
                            startTime: Date.now()
                        }
                    }
                    
                    case "join-room": {
                        return {
                            members: [...state.members, event.user]
                        }
                    }
                }
            })
        }
    }))

    roomStore.subscribe((state) => {
        io.to(`user:${owner.id}`).emit("state", {
            ...state,
            position: state.getPosition()
        })
    })

    rooms.set(id, roomStore);
}

async function authMiddleware(socket, next) {
    const session = await auth.api.getSession({
        headers: socket.request.headers
    })

    if(!session) {
        socket.data.user = null;
        return;
    }
    
    if(!users.has(session.user.id)) {
        users.set(session.user.id, { room: null });
    }

    socket.data.user = session.user;

    next();
}

io.use(authMiddleware);

io.on("connection", (socket) => {
    const user = socket.data.user;

    socket.join(`user:${user.id}`);

    socket.on("join-room", async (id, callback) => {
        if(!rooms.has(id)) {
            callback({
                status: "fail",
                reason: "Room not found!"
            })
            return;
        }

        const room = rooms.get(id).getState();
        
        io.in(`user:${user.id}`).socketsJoin(`room:${id}`);
        
        users.get(socket.data.user.id).room = id;

        room.dispatchEvent({
            type: "join-room",
            user: socket.data.user
        })

        callback({
            status: "success"
        })
    })

    socket.on("create-room", async (callback) => {
        const id = nanoid(8);

        createRoom(id, socket.data.user);
        
        const room = rooms.get(id).getState();

        io.in(`user:${user.id}`).socketsJoin(`room:${id}`);
        
        users.get(socket.data.user.id).room = id;

        room.dispatchEvent({
            type: "join-room",
            user: socket.data.user
        })

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
                        rooms.get(users.get(socket.data.user.id).room).getState().dispatchEvent({
                            type: "add-song",
                            song: songData
                        })
                    })
            })
    })

    socket.on("toggle-pause", () => {
        rooms.get(users.get(socket.data.user.id).room).getState().dispatchEvent({
            type: "toggle-pause",
            user: socket.data.user
        })
    })

    socket.on("skip-next", () => {
        rooms.get(users.get(socket.data.user.id).room).getState().dispatchEvent({
            type: "end-song",
            user: socket.data.user
        })
        rooms.get(users.get(socket.data.user.id).room).getState().dispatchEvent({
            type: "play-next",
            user: socket.data.user
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

app.use(cors({
    origin: "http://localhost:5173",
    credentials: true
}))
app.all("/api/auth/{*any}", toNodeHandler(auth.handler));
app.use(express.json());
httpServer.listen(3000);