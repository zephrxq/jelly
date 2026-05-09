import express from "express";
import dotenv from "dotenv";
import { createServer } from "http";
import { Server } from "socket.io";
import { execFile } from "child_process";
import { parse } from "tinyduration";
import { createStore } from "zustand/vanilla";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
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

                    if(get().status == "playing") {
                        clearTimeout(get().timeout);
                    } else if(get().status == "paused") {
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
                            members: [...state.members, event.nickname]
                        }
                    }
                }
            })
        }
    }))

    roomStore.subscribe((state) => {
        io.to(id).emit("state", {
            ...state,
            position: state.getPosition()
        })
        console.log(id)
    })

    rooms.set(id, roomStore);
}

io.on("connection", (socket) => {
    let roomId = "";
    let searchResults = {};

    socket.on("join-room", (nickname, id, callback) => {
        if(!rooms.has(id)) {
            callback({
                status: "fail",
                reason: "Room not found!"
            })
            return;
        } else if(socket.rooms.size > 1) {
            callback({
                status: "fail",
                reason: "You are already in a room."
            })
            return;
        } else if(!nickname.trim()) {
            callback({
                status: "fail",
                reason: "Invalid nickname"
            })
            return;
        }

        roomId = id;
        socket.join(roomId);
        
        const room = rooms.get(roomId).getState();

        room.dispatchEvent({
            type: "join-room",
            nickname
        })

        callback({
            status: "success"
        })
    })

    socket.on("create-room", (nickname, callback) => {
        if(!nickname.trim()) {
            callback({
                status: "fail",
                reason: "Invalid nickname"
            })
            return;
        }
        
        roomId = socket.id.toUpperCase();
        createRoom(roomId, nickname);
        
        const room = rooms.get(roomId).getState();

        socket.join(roomId);

        room.dispatchEvent({
            type: "join-room",
            nickname
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
                        
                        rooms.get(roomId).getState().dispatchEvent({
                            type: "add-song",
                            song: songData
                        })
                    })
            })
    })

    socket.on("toggle-pause", () => {
        rooms.get(roomId).getState().dispatchEvent({ type: "toggle-pause" });
    })

    socket.on("skip-next", () => {
        rooms.get(roomId).getState().dispatchEvent({ type: "end-song" });
        rooms.get(roomId).getState().dispatchEvent({ type: "play-next" });
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