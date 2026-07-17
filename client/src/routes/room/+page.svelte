<script>
    import { onMount, onDestroy, tick } from "svelte";
    import { io } from "socket.io-client";
    import { addAlert } from "$lib/alerts.js";
    import { Play, Pause, SkipBack, SkipForward, Search, Users, LogOut, X, ArrowLeft, ArrowRight, ArrowBigDown } from "@lucide/svelte";
    import { PUBLIC_SERVER_URL } from "$env/static/public";
    import { goto } from "$app/navigation";
    
    let socket;
    let room = $state({});
    let searchQuery = $state();
    let searchResults = $state([]);
    let searchResultsPage = $state(0);
    let searchResultsPages = $derived(Math.ceil(searchResults.length / 5));
    let audioElem = $state();
    let audioSrc = $state();
    let playIcon = $state("play");
    let tabs = $state();
    let tabSizes = $state({ left: 25, middle: 50, right: 25 });
    let windows = $state({ members: false });
    let resizing = null;
    let seeking = false;
    let mediaSource;
    let sourceBuffer;
    let audioQueue = [];
    let currentTime = $state();

    onMount(async () => {
        socket = io(PUBLIC_SERVER_URL, {
            withCredentials: true
        })

        socket.on("state", async (state) => {
            room = state;

            if(audioSrc != `${PUBLIC_SERVER_URL}/songs/${room.song.id}`) {
                audioSrc = `${PUBLIC_SERVER_URL}/songs/${room.song.id}`;
                await loadAudio();
            }

            if(room.status == "playing") {
                if(audioElem.paused) {
                    playAudio();
                }
            } else {
                audioElem.currentTime = (room.pauseTime - room.startTime) / 1000;
            }
        })

        socket.on("song-added", (song) => {
            room.queue.push(song);
        })

        socket.on("song-paused", () => {
            audioElem.pause();
        })

        socket.on("song-played", () => {
            playAudio();
        })

        socket.on("leave-room", () => {
            goto("/home");
        })

        document.addEventListener("mousemove", (event) => {
            if(resizing) {
                moveResize(event);
            }
        })
        
        document.addEventListener("mouseup", (event) => {
            if(resizing) {
                endResize(event);
            }
            if(seeking) {
                endSeeking(event);
            }
        })
        
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
            searchResultsPage = 0;
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

    function toggleWindow(window) {
        windows[window] = !windows[window];
    }

    function startSeeking(event) {
        seeking = true;
    }

    function seek(event) {
        if(!room.song.id) {
            return
        }

        const newTime = event.target.value * 1000;

        room.startTime = Date.now() - (newTime);
        socket.emit("seek", newTime);
    }

    function endSeeking(event) {
        seeking = false;
    }

    function updateTime() {
        if(seeking) {
            return;
        }

        currentTime = audioElem.currentTime;
    }
</script>

<div id="room">
    <audio bind:this={audioElem} ontimeupdate={updateTime} src={audioSrc}></audio>
    <div id="topbar">
        <div id="left">
            <h2>{`${room.owner?.name}'s room`}</h2>
            <button title="Copy ID" id="copy" onclick={copyId}>{`#${room.id}`}</button>
        </div>
        <div id="right">
            <button class="secondary" onclick={() => toggleWindow("members")}>
                <Users size={24}></Users>
            </button>
            <button class="secondary" onclick={leaveRoom}>
                <LogOut size={24}></LogOut>
            </button>
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
            {#if Object.keys(searchResults).length > 0}
                <div id="searchResults">
                    <div id="searchResultsScroll">
                        {#each searchResults.slice(searchResultsPage * 5, Math.min(searchResults.length, searchResultsPage * 5 + 5)) as searchResult, index}
                            <button class="searchResult" onclick={() => addSong(searchResult.id.videoId)}>
                                <h3>{decodeHtml(searchResult.snippet.title)}</h3>
                                <p>{decodeHtml(searchResult.snippet.channelTitle)}</p>
                            </button>
                        {/each}
                        <div id="searchResultsControls">
                            <button onclick={() => { if(searchResultsPage > 0) searchResultsPage -= 1}}>
                                <ArrowLeft size={28}></ArrowLeft>
                            </button>
                            <p>Page {searchResultsPage + 1}</p>
                            <button onclick={() => { if(searchResultsPage < searchResultsPages - 1) searchResultsPage += 1 }}>
                                <ArrowRight size={28}></ArrowRight>
                            </button>
                        </div>
                    </div>
                </div>
            {/if}
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
                <input type="range" onchange={seek} value={currentTime} min={0} max={(room.song?.duration || 0) / 1000} step={1} onmousedown={startSeeking}>
                <div id="buttons">
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
        <div id="members" class="window" hidden={!windows.members}>
            <div id="title">
                <h2>Members</h2>
                <button>
                    <X size={24} onclick={() => { toggleWindow("members") }}></X>
                </button>
            </div>
            {#each room.members as member}
                <div class="member">
                    <p id="name">{member.name}</p>
                    <p id="user">@{member.username}</p>
                </div>
            {/each}
            <p></p>
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

    div#topbar div#right button {
        height: 40px;
        width: 40px;
        padding: 8px;
        margin-left: 8px;
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

    div#searchResultsControls {
        display: flex;
        flex-direction: row;
        justify-content: center;
    }

    div#searchResultsControls button {
        background-color: transparent;
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
        box-shadow: 0px 0px 15px 5px var(--primary-900);
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
        flex-direction: column;
        margin-top: 24px;
    }

    div#nowPlayingControls #buttons {
        width: 100%;
        display: flex;
        flex-direction: row;
        justify-content: center;
        margin-top: 8px;
    }
    
    div#nowPlayingControls #buttons button {
        height: 28px;
        width: 28px;
        padding: 8px;
        border-radius: 50%;
        box-sizing: content-box;
        background-color: var(--background);
        margin-right: 32px;
    }

    div#nowPlayingControls #buttons button:hover {
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

    div.window {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        height: 75%;
        width: 25%;
        background-color: var(--primary-950);
        border: 1px solid var(--primary-600);
        border-radius: 8px;
        padding: 0;
    }

    div.window #title {
        display: flex;
        flex-direction: row;
        width: 100%;
        padding: 12px;
        background-color: var(--primary-900);
        border-radius: 8px 8px 0 0;
    }

    div.window #title h2 {
        margin: 0 0 0 8px;
    }

    div.window #title button {
        padding: 4px;
        height: 32px;
        width: 32px;
        border-radius: 999px;
        background-color: transparent;
        margin-left: auto;
    }

    div.window #title button:hover {
        background-color: var(--primary-600);
    }

    div.window div.member {
        padding: 16px 24px;
    }
    
    div.window div.member p {
        margin: 0;
    }

    div.window div.member p#user {
        color: var(--text-200);
    }
</style>