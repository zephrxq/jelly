import { customAlphabet } from "nanoid";
import { spawn } from "child_process";
import { fileExists } from "./utils.js";
import { client } from "./redis.js";

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
    
    async addSong(song) {
        this.queue.push(song);

        if(!this.song.id) {
            await this.playNext();
        }
    }
    
    async playLast() {
        if(this.queue.length == 0) {
            return;
        }

        if(this.song.id) {
            this.queue.push(this.song);
        }

        const song = this.history.pop();
        
        await this.downloadSong(song);

        this.playSong(song);
    }

    async playNext() {
        if(this.queue.length == 0) {
            return;
        }

        if(this.song.id) {
            this.history.push(this.song);
        }

        this.status = "loading";

        this.io.emit("state", this.snapshot());

        const song = this.queue.shift();

        await this.downloadSong(song);
        this.playSong(song);

        const downloadQueue = this.queue.slice(0, 5);

        Promise.all(downloadQueue.map((queueSong) => {
            return this.downloadSong(queueSong);
        }))
    }

    endSong() {
        this.song = EMPTY_SONG;
        this.status = "idle";
        this.startTime = null;
        this.pauseTime = null;
        this.songReady = false;

        this.io.emit("state", this.snapshot());
    }
    
    async skipNext() {
        if(this.queue.length == 0) {
            return;
        }

        this.endSong();
        await this.playNext();
    }

    async skipBack() {
        if(this.history.length == 0) {
            return;
        }

        this.endSong();
        await this.playLast();
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

    async playSong(song) {
        if(!song.id) {
            return;
        }

        this.endSong();

        this.song = song;
        this.status = "playing";
        this.startTime = Date.now();
        this.pauseTime = null;
        this.songReady = true;

        this.io.emit("state", this.snapshot());
    }

    async downloadSong(song) {
        const songPath = `./songs/${song.id}`;
        const downloaded = await fileExists(songPath);

        if(downloaded) {
            return;
        }

        await client.set(
            `song-file:${song.id}`,
            songPath,
            {
                EX: song.duration + 3600
            }
        )

        return new Promise((resolve, reject) => {
            let spawnCmd = ["-f", "bestaudio", "-o", "./songs/%(id)s", "-q", "--no-warnings", `https://youtube.com/watch?v=${song.id}`, "--cookies", "./server/cookies.txt"];

            const ytDlp = spawn("./server/yt-dlp", spawnCmd);

            ytDlp.on("error", reject);
            ytDlp.on("close", resolve);
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