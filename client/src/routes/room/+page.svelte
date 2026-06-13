<script>
    import { onMount, onDestroy, tick } from "svelte";
    import { io } from "socket.io-client";
    import { addAlert } from "$lib/alerts.js";
    import Play from "@lucide/svelte/icons/play";
    import Pause from "@lucide/svelte/icons/pause";
    import SkipBack from "@lucide/svelte/icons/skip-back";
    import SkipForward from "@lucide/svelte/icons/skip-forward";
    import Search from "@lucide/svelte/icons/search";
    import { PUBLIC_SERVER, PUBLIC_SERVER_URL } from "$env/static/public";
    import { goto } from "$app/navigation";
    import "../../animations.css";

    let socket;
    let room = $state({});
    let searchQuery = $state();
    let searchResults = $state([]);
    let audioElem = $state();
    let audioSrc = $state();
    let playIcon = $state("play");
    let tabs = $state();
    let tabSizes = $state({ left: 25, middle: 50, right: 25 });
    let resizing = null;
    let mediaSource;
    let sourceBuffer;
    let audioQueue = [];

    onMount(async () => {
        socket = io(PUBLIC_SERVER_URL, {
            withCredentials: true
        })

        socket.on("state", async (state) => {
            room = state;
            
            if(audioSrc != `${PUBLIC_SERVER_URL}/songs/${room.song.id}.m4a`) {
                audioSrc = `${PUBLIC_SERVER_URL}/songs/${room.song.id}.m4a`;
                await loadAudio();
            }
            
            if(room.status == "playing") {
                if(audioElem.paused) {
                    playAudio();
                }
            }
        })

        socket.on("song-added", (song) => {
            room.queue.push(song);
        })

        socket.on("song-paused", (state) => {
            room = state;
            audioElem.pause();
        })

        socket.on("song-played", (state) => {
            room = state;
            playAudio();
        })

        document.addEventListener("mousemove", moveResize);
        document.addEventListener("mouseup", endResize);
        
        if("mediaSession" in navigator) {
            navigator.mediaSession.setActionHandler("play", togglePause);
            navigator.mediaSession.setActionHandler("pause", togglePause);
            navigator.mediaSession.setActionHandler("previoustrack", skipBack);
            navigator.mediaSession.setActionHandler("nexttrack", skipNext);
        }

        setInterval(syncTime, 500);
    })

    onDestroy(() => {
        socket?.disconnect();
    })

    function loadAudio() {
        return new Promise((resolve, reject) => {
            audioElem.load();

            audioElem.addEventListener("canplaythrough", resolve, { once: true });
        })
    }

    async function playAudio() {
        try {
            syncTime();
            await audioElem.play();
        } catch(error) {
            addAlert({ text: "Failed to play", onClose: () => audioElem.play() });
        }
    }

    function syncTime() {
        if(room.status != "playing") return;
        
        const serverTime = (Date.now() - room.startTime) / 1000;
        const drift = audioElem.currentTime - serverTime;
        
        if(Math.abs(drift) > 0.5) {
            audioElem.currentTime = serverTime;
        }
        if(drift > 0.1) {
            audioElem.playbackRate = 0.98;
        } else if(drift < -0.1) {
            audioElem.playbackRate = 1.02;
        } else {
            audioElem.playbackRate = 1;
        }
    }

    function decodeHtml(html) {
        const text = document.createElement("textarea");
        text.innerHTML = html;
        return text.value;
    }

    function search() {
        if(!room || !searchQuery) return;
        socket.emit("search", searchQuery, (data) => {
            searchResults = data;
        })
    }

    function addSong(songId) {
        socket.emit("add-song", songId);
    }

    function togglePause() {
        socket.emit("toggle-pause");
    }

    function skipNext() {
        socket.emit("skip-next");
    }

    function skipBack() {
        socket.emit("skip-back");
    }

    function leaveRoom() {
        socket.emit("leave-room");
        goto("/home");
    }
    
    function copyId() {
        try {
            navigator.clipboard.writeText(room.id);
        } catch(error) {
            console.log(error);
        }
    }

    function startResize(event) {
        resizing = {
            id: event.currentTarget.id,
            startX: event.clientX
        }
    }

    function moveResize(event) {
        if(!resizing) return;

        const tabsRect = tabs.getBoundingClientRect();
        const delta = event.clientX - resizing.startX;
        const deltaPercent = (delta / (tabsRect.width - 16)) * 100; // subtract resizer widths

        if(resizing.id == "left") {
            const newLeft = tabSizes.left + deltaPercent;
            const newMiddle = tabSizes.middle - deltaPercent;

            if(newLeft > 20 && newMiddle > 20) {
                tabSizes.left = newLeft;
                tabSizes.middle = newMiddle;

                resizing.startX = event.clientX;
            }
        }

        if(resizing.id == "right") {
            const newRight = tabSizes.right - deltaPercent;
            const newMiddle = tabSizes.middle + deltaPercent;

            if(newRight > 20 && newMiddle > 20) {
                tabSizes.right = newRight;
                tabSizes.middle = newMiddle;

                resizing.startX = event.clientX;
            }
        }
    }

    function endResize(event) {
        resizing = null;
    }
</script>

<div id="room">
    <audio bind:this={audioElem} src={audioSrc}></audio>
    <div id="topbar">
        <div id="left">
            <h2>{`${room.owner?.name}'s room`}</h2>
            <button title="Copy ID" id="copy" onclick={copyId}>{`#${room.id}`}</button>
        </div>
        <div id="right">
            <button onclick={leaveRoom}>Leave room</button>
        </div>
    </div>
    <div id="tabs" bind:this={tabs}>
        <div id="search" class="tab" style="flex-basis: {tabSizes.left}%">
            <div id="searchBar">
                <input bind:value={searchQuery} onkeydown={(event) => { if(event.key == "Enter") search(); }}>
                <button aria-label="Search" onclick={search}>
                    <Search></Search>
                </button>
            </div>
            <div id="searchResults">
                <div id="searchResultsScroll">
                    {#each searchResults as searchResult, index}
                        <button class="searchResult" onclick={() => addSong(searchResult.id.videoId)}>
                            <h3>{decodeHtml(searchResult.snippet.title)}</h3>
                            <p>{decodeHtml(searchResult.snippet.channelTitle)}</p>
                        </button>
                    {/each}
                </div>
            </div>
        </div>
        <button aria-label="Resize left" class="tab resizer" id="left" onmousedown={(event) => startResize(event)}>
            <div></div>
        </button>
        <div id="nowPlaying" class="tab" style="flex-basis: {tabSizes.middle}%">
            <div id="nowPlayingInfo">
                <div id="thumbnail">
                    <img alt="Thumbnail" src={room.song?.thumbnail} hidden={!room.song?.thumbnail}>
                    <div class="loading" hidden={room.status != "loading"}></div>
                </div>
                <h2>{room.song?.title}</h2>
                <p>{room.song?.artist}</p>
            </div>
            <div id="nowPlayingControls">
                <button id="back" aria-label="Back" onclick={skipBack}>
                    <SkipBack size={28}></SkipBack>
                </button>
                <button id="play" aria-label="Play" onclick={togglePause}>
                    {#if room.status == "paused" || room.status == "idle"}
                        <Play size={28}></Play>
                    {:else}
                        <Pause size={28}></Pause>
                    {/if}
                </button>
                <button id="next" aria-label="Next" onclick={skipNext}>
                    <SkipForward size={28}></SkipForward>
                </button>
            </div>
        </div>
        <button aria-label="Resize right" class="tab resizer" id="right" onmousedown={(event) => startResize(event)}>
            <div></div>
        </button>
        <div id="info" class="tab" style="flex-basis: {tabSizes.right}%">
            <h2>Queue</h2>
            {#each room.queue as song}
                <div class="song">
                    <img alt="Thumbnail" src={song.thumbnail}>
                    <div class="song-info">
                        <h3 id="title">{song.title}</h3>
                        <p id="artist">{song.artist}</p>
                    </div>
                </div>
            {/each}
        </div>
    </div>
</div>

<style>
    div#room {
        display: flex;
        flex-direction: column;
        height: 100%;
    }

    div#topbar {
        height: fit-content;
        padding: 16px 24px;
        display: flex;
        flex-direction: row;
        background-color: var(--primary-900);
    }

    div#topbar h2 {
        margin: 0;
        height: fit-content;
    }

    div#topbar #copy {
        padding: 0;
        background-color: transparent;
        color: var(--text-300);
        margin-left: 8px;
    }
    
    div#topbar #copy:hover {
        text-decoration: underline;
    }

    div#topbar div {
        display: flex;
        flex-direction: row;
        align-items: center;
    }

    div#topbar div#right {
        margin-left: auto;
    }

    div#tabs {
        display: flex;
        flex-direction: row;
        flex: 1;
        min-height: 0;
    }

    div.tab {
        display: flex;
        flex-direction: column;
        padding: 16px 24px;
        min-height: 0;
        height: 100%;
    }

    button.resizer {
        padding: 4px;
        height: 100%;
        cursor: col-resize;
        border-radius: 999px;
        background-color: transparent;
    }

    button.resizer div {
        height: 100%;
        width: 2px;
        background-color: var(--primary-800);
    }

    button.resizer:hover > div{
        background-color: var(--primary-700);
    }

    div#search {
        width: 25%;
    }

    div#searchBar {
        height: fit-content;
        width: 100%;
        display: flex;
        flex-direction: row;
        background-color: var(--primary-700);
        border-radius: 999px;
        transition: 0.1s;
        border: 1px solid transparent;
    }

    div#searchBar button {
        border-radius: 0 999px 999px 0;
        background-color: transparent;
        padding: 8px 12px;
    }

    div#searchBar input {
        flex: 1;
        border-radius: 999px 0 0 999px;
        box-sizing: border-box;
        width: 0%;
        padding: 8px 0 8px 16px;
        background-color: inherit;
        background-color: transparent;
        border: none;
    }

    div#searchBar:hover {
        background-color: var(--primary-600);
    }

    div#searchBar:has(input:focus) {
        background-color: var(--primary-700);
        border-color: var(--primary-200);
    }

    div#searchResults {
        margin-top: 16px;
        height: fit-content;
        width: 100%;
        overflow-y: hidden;
        border-radius: 8px;
        transition: 0.1s;
        border: 1px solid var(--background-800);
    }
    
    div#searchResults:has(div#searchResultsScroll:empty) {
        border-color: transparent;
    }
    
    div#searchResultsScroll {
        height: fit-content;
        max-height: 100%;
        width: 100%;
        overflow-y: auto;
        transition: 0.1s;
        padding: 8px;
    }

    button.searchResult {
        display: flex;
        flex-direction: column;
        margin-bottom: 32px;
        align-items: start;
        background-color: transparent;
        margin: 0;
        border-radius: 0;
        width: 100%;
        box-sizing: border-box;
        padding: 16px;
        border-radius: 8px;
    }

    button.searchResult:hover {
        background-color: var(--primary-800);
    }

    button.searchResult h3 {
        margin: 0;
        margin-bottom: 8px;
    }
    
    button.searchResult p {
        margin: 0;
    }

    div#nowPlaying {
        width: 50%;
    }

    div#nowPlayingInfo {
        display: flex;
        flex-direction: column;
    }

    div#nowPlayingInfo #thumbnail {
        height: fit-content;
        width: 100%;
        aspect-ratio: 16 / 9;
        background-color: var(--primary-800);
        display: flex;
        justify-content: center;
        align-items: center;
    }

    div#nowPlayingInfo img {
        width: 100%;
        aspect-ratio: 16 / 9;
    }

    div#nowPlaying h2 {
        margin: 16px 0 0 0;
    }

    div#nowPlaying p {
        margin: 0;
        color: var(--text-200);
    }

    div#nowPlayingControls {
        width: 100%;
        display: flex;
        flex-direction: row;
        justify-content: center;
        margin-top: 16px;
    }
    
    div#nowPlayingControls button {
        height: 28px;
        width: 28px;
        padding: 8px;
        border-radius: 50%;
        box-sizing: content-box;
        background-color: var(--background);
        margin-right: 32px;
    }

    div#nowPlayingControls button:hover {
        background-color: var(--primary-600);
    }

    div#info {
        width: 25%;
        flex-direction: column;
        overflow-y: auto;
    }

    div#info > h2 {
        margin: 0 0 16px 0;
    }

    div.song {
        display: flex;
        flex-direction: row;
        margin-bottom: 16px;
    }

    div.song img {
        height: 64px;
    }

    div.song-info {
        display: flex;
        flex-direction: column;
        margin-left: 12px;
        min-width: 0;
        white-space: nowrap;
        text-overflow: ellipsis;
    }

    div.song-info #title {
        font-weight: 700;
        margin: 0;
        text-overflow: ellipsis;
        overflow: hidden;
    }

    div.song-info #artist {
        color: var(--text-300);
        text-overflow: ellipsis;
        overflow: hidden;
    }
</style>