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
        this.members = [];
        this.actions = [];
        this.queue = [];
        this.queueIndex = -1;
        this.song = EMPTY_SONG;
        this.songReady = false;
        this.status = "idle";
        this.startTime = null;
        this.pauseTime = null;
        this.processing = Promise.resolve();
        this.id = id;
        this.io = io;
    }

    dispatch(action) {
        const result = this.processing.then(async () => {
            const res = await this.reduce(action);
            this.io.to(`room:${this.id}`).emit("state", this.snapshot());
            return res;
        })

        this.processing = result.catch((error) => {
            console.log(error);
        })

        return result;
    }

    async reduce(action) {
        switch(action.type) {
            case "ADD_SONG": {
                return this.handleAddSong(action.song);
            }

            case "PLAY_LAST": {
                return this.handlePlayLast();
            }

            case "PLAY_NEXT": {
                return this.handlePlayNext();
            }

            case "SKIP_NEXT": {
                return this.handleSkipNext();
            }

            case "SKIP_BACK": {
                return this.handleSkipBack();
            }

            case "TOGGLE_PAUSE": {
                return this.handleTogglePause();
            }

            case "SONG_FINISHED": {
                return this.handleSongFinished();
            }

            case "SEEK": {
                return this.handleSeek(action.time);
            }
        }
    }

    async handleAddSong(song) {
        this.queue.push(song);

        if(!this.song.id) {
            return this.handlePlayNext();
        } else {
            void this.downloadSong(song);
        }
    }
    
    async handlePlayLast() {
        if(this.queueIndex < 1) {
            return;
        }

        this.status = "loading";
        this.io.to(`room:${this.id}`).emit("state", this.snapshot());

        this.queueIndex -= 1;
        const song = this.queue[this.queueIndex];
        
        await this.downloadSong(song);
        this.playSong(song);
    }

    async handlePlayNext() {
        if(this.queueIndex + 1 >= this.queue.length) {
            return;
        }
        
        this.status = "loading";
        this.io.to(`room:${this.id}`).emit("state", this.snapshot());

        this.queueIndex += 1;
        const song = this.queue[this.queueIndex];

        await this.downloadSong(song);
        this.playSong(song);

        const downloadQueue = this.queue.slice(this.queueIndex + 1, this.queueIndex + 5);

        void Promise.allSettled(downloadQueue.map((queueSong) => {
            return this.downloadSong(queueSong);
        }))
    }

    async handleSkipBack() {
        if(this.queueIndex < 1) {
            return;
        }

        this.endSong();

        return this.handlePlayLast();
    }

    async handleSkipNext() {
        if(this.queueIndex + 1 >= this.queue.length) {
            return;
        }

        this.endSong();

        return this.handlePlayNext();
    }

    handleTogglePause() {
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

    async handleSongFinished() {
        this.endSong();

        return this.handlePlayNext();
    }

    handleSeek(time) {
        if(!this.song.id) {
            return;
        }

        this.startTime = Date.now() - (time);
    }

    async downloadSong(song) {
        const songPath = `./songs/${song.id}.m4a`;
        const downloaded = await fileExists(songPath);
        
        if(downloaded) {
            return;
        }

        return new Promise((resolve, reject) => {
            let spawnCmd = ["-P", "./songs", "-o", "%(id)s", "--cookies", "./server/cookies.txt", "--extractor-args", "youtube:player-client=web", "--extract-audio", "--audio-format", "m4a", "--no-playlist", "--quiet", "--no-warnings", `https://youtube.com/watch?v=${song.id}`];

            const ytDlp = spawn("yt-dlp", spawnCmd);
            
            ytDlp.on("error", reject);
            ytDlp.on("close", async (code) => {
                if(code != 0) {
                    return reject(new Error(`yt-dlp exited with code ${code}`));
                }

                await client.set(
                    `song-file:${song.id}`,
                    songPath,
                    {
                        EX: song.duration + 3600
                    }
                )

                resolve();
            })
        })
    }
    
    playSong(song) {
        if(!song.id) {
            return;
        }

        this.endSong();

        this.song = song;
        this.status = "playing";
        this.startTime = Date.now();
        this.pauseTime = null;
        this.songReady = true;
    }

    endSong() {
        if(!this.song.id) {
            return;
        }

        this.song = EMPTY_SONG;
        this.status = "idle";
        this.startTime = null;
        this.pauseTime = null;
        this.songReady = false;
    }
    
    snapshot() {
        return {
            owner: this.owner,
            queue: this.queue.slice(this.queueIndex + 1),
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
            this.dispatch({
                type: "SONG_FINISHED"
            })

            return true;
        }

        return false;
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