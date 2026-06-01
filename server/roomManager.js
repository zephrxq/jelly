import { customAlphabet } from "nanoid";
import { spawn } from "child_process";

const nanoid = customAlphabet("1234567890abcdef", 8);

const EMPTY_SONG = {
    id: "",
    title: "Nothing playing",
    artist: "Unknown artist",
    thumbnail: "",
    paused: true,
    duration: 0,
    url: null
}

class Room {
    constructor(id, owner, io) {
        this.owner = owner;
        this.queue = [];
        this.history = [];
        this.members = [];
        this.clients = new Set();
        this.song = EMPTY_SONG;
        this.songReady = false;
        this.status = "idle";
        this.startTime = null;
        this.pauseTime = null;
        this.id = id;
        this.io = io;
        this.initSegment = null;
    }

    snapshot() {
        return {
            owner: this.owner,
            queue: this.queue,
            history: this.history,
            members: this.members,
            song: this.song,
            songReady: this.songReady,
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
        
        this.playSong(song);
    }

    playNext() {
        if(this.queue.length == 0) {
            return;
        }

        if(this.song.id) {
            this.history.push(this.song);
        }

        const song = this.queue.shift();
        
        this.playSong(song);
    }

    endSong() {
        this.song = EMPTY_SONG;
        this.status = "idle";
        this.startTime = null;
        this.pauseTime = null;
        this.songReady = false;
        this.initSegment = null;
        if(this.ffmpeg) {
            this.ffmpeg.kill("SIGKILL");
        }

        this.io.emit("state", this.snapshot());
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
            this.ffmpeg.kill("SIGSTOP");
            this.io.to(`room:${this.id}`).emit("song-paused");
        } else {
            this.startTime += Date.now() - this.pauseTime;
            this.status = "playing";
            this.ffmpeg.kill("SIGCONT");
            this.io.to(`room:${this.id}`).emit("song-played");
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

    async playSong(song) {
        if(!song.id) {
            return;
        }

        this.endSong();

        this.ffmpeg = spawn("ffmpeg", [
            "-readrate",
            "1",

            "-i",
            song.url,

            "-vn",

            "-c:a",
            "libopus",

            "-f",
            "webm",

            "-dash",
            "1",

            "-live",
            "1",

            "-reconnect",
            "1",
            
            "-reconnect_streamed",
            "1",
            
            "-reconnect_on_network_error",
            "1",

            "pipe:1"
        ])

        let buffer = Buffer.alloc(0);

        this.ffmpeg.stdout.on("data", (chunk) => {
            if(!this.songReady) {
                buffer = Buffer.concat([buffer, chunk]);
                const clusterIndex = buffer.indexOf(Buffer.from([0x1F, 0x43, 0xB6, 0x75]));

                if(clusterIndex != -1) {
                    const leftover = buffer.subarray(clusterIndex);

                    this.song = song;
                    this.status = "playing";
                    this.startTime = Date.now();
                    this.pauseTime = null;
                    this.songReady = true;
                    this.initSegment = buffer.subarray(0, clusterIndex);

                    this.io.to(`room:${this.id}`).emit("song-ready", this.snapshot());

                    for(const client of this.clients) {
                        if(client.readyState == 1) {
                            client.send(this.initSegment);
                        }
                    }
                    
                    for(const client of this.clients) {
                        if(client.readyState == 1) {
                            client.send(leftover);
                        }
                    }
                }

                return;
            }
            
            for(const client of this.clients) {
                if(client.readyState == 1) {
                    client.send(chunk);
                }
            }
        })

        this.ffmpeg.stderr.on("data", d => {
            console.log("[ffmpeg]", d.toString());
        });

        this.ffmpeg.on("exit", (code, signal) => {
            console.log(song.duration);
            console.log("EXIT", code, signal);
        });

        this.ffmpeg.on("close", (code, signal) => {
            console.log("CLOSE", code, signal);
        });

        this.ffmpeg.on("error", err => {
            console.error("SPAWN ERROR", err);
        });
    }
}

class RoomManager {
    constructor() {
        this.rooms = new Map();
    }
    
    createRoom(owner, io) {
        const id = nanoid();
        const room = new Room(id, owner.data, io);

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

export const roomManager = new RoomManager();