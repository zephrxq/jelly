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
        this.song = EMPTY_SONG;
        this.songReady = false;
        this.status = "idle";
        this.startTime = null;
        this.pauseTime = null;
        this.id = id;
        this.io = io;
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
            this.io.to(`room:${this.id}`).emit("song-paused", this.snapshot());
        } else {
            this.startTime += Date.now() - this.pauseTime;
            this.status = "playing";
            this.io.to(`room:${this.id}`).emit("song-played", this.snapshot());
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

    playSong(song) {
        if(!song.id) {
            return;
        }

        this.endSong();

        let spawnCmd = ["-f", "bestaudio", "-o", "./songs/%(id)s", "-q", "--no-warnings", `https://youtube.com/watch?v=${song.id}`, "--cookies", "./server/cookies.txt"];

        const ytDlp = spawn("./server/yt-dlp", spawnCmd);

        ytDlp.on("error", (error) => {
            return;
        })

        ytDlp.on("close", () => {
            this.song = song;
            this.status = "playing";
            this.startTime = Date.now();
            this.pauseTime = null;
            this.songReady = true;

            this.io.emit("state", this.snapshot());
        })
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