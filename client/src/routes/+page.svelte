<script>
    import { onMount, onDestroy, tick } from "svelte";
    import { io } from "socket.io-client";
    import Alert from "$lib/Alert.svelte";
    import Play from "@lucide/svelte/icons/play";
    import Pause from "@lucide/svelte/icons/pause";
    import SkipBack from "@lucide/svelte/icons/skip-back";
    import SkipForward from "@lucide/svelte/icons/skip-forward";
    import Search from "@lucide/svelte/icons/search";

    let socket;
    let showRoomInput = $state(false);
    let roomData = $state({});
    let searchQuery = $state();
    let searchResults = $state([]);
    let audioElem = $state();
    let audioSrc = $state();
    let homeElem = $state();
    let roomElem = $state();
    let isInRoom = $derived(Object.keys(roomData).length > 0);
    let playIcon = $state("play");
    let alerts = $state([]);

    onMount(() => {
        socket = io("localhost:3000");

        socket.on("play-song", (data) => {
            roomData = data;
            playSong();
        })

        socket.on("end-song", (data) => {
            roomData = data;
            endSong();
        })

        socket.on("toggle-pause", (data) => {
            roomData = data;

            if(roomData.song.paused) {
                playIcon = "play";
                audioElem.pause();
            } else {
                playIcon = "pause";
                audioElem.currentTime = (Date.now() - roomData.song.timeStart) / 1000;
                audioElem.play();
            }
        })
    })

    function decodeHtml(html) {
        const text = document.createElement("textarea");
        text.innerHTML = html;
        return text.value;
    }

    function addAlert({ title = "", text = "", isInput = false, acceptEmpty = true, onInput = () => {} }) {
        alerts.push({
            title: title,
            text: text,
            isInput: isInput,
            acceptEmpty: acceptEmpty,
            onInput: onInput
        })
    }

    function removeAlert(index) {
        alerts.splice(index, 1);
    }

    function playSong() {
        if(!roomData.song.id) {
            return;
        }
        
        playIcon = "pause";
        audioSrc = roomData.song.url;
        audioElem.onloadedmetadata = () => {
            audioElem.currentTime = (Date.now() - roomData.song.timeStart) / 1000;
            audioElem.play();
        }
    }

    function endSong() {
        playIcon = "play";
        audioElem.pause();
        audioSrc = "";
    }

    function toggleJoinInput() {
        showRoomInput = !showRoomInput;
    }

    function joinAlert() {
        addAlert({
            title: "Join room",
            text: "Enter room ID",
            isInput: true,
            acceptEmpty: false,
            onInput: ((roomId) => {
                tryJoinRoom(roomId)
            })
        })
    }

    function tryJoinRoom(roomId) {
        socket.emit("join-room", roomId, (joinResult) => {
            if(joinResult.status == "success") {
                roomData = joinResult.roomData;
                joinRoom();
            } else if(joinResult.status == "fail") {
                addAlert({
                    title: "Failed to join room",
                    text: joinResult.reason
                })
            }
        })
    }
    
    function joinRoom() {
        playSong();
    }

    function createRoom() {
        socket.emit("create-room", (createResult) => {
            if(createResult.status == "success") {
                roomData = createResult.roomData;
                joinRoom();
            } else if(createResult.status == "fail") {
                addAlert({
                    title: "Failed to create room",
                    text: createResult.reason
                })
            }
        })
    }

    function search() {
        if(!roomData || !searchQuery) return;
        socket.emit("search", searchQuery, (data) => {
            console.log(data)
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
</script>

{#each alerts as alertData, index}
    <Alert alertData={alertData} onClose={() => { removeAlert(index) }}></Alert>
{/each}

<div id="home" bind:this={homeElem} style="display: {!isInRoom ? "block" : "none"}">
    <h1>Home</h1>
    <button onclick={joinAlert}>Join room</button>
    <button onclick={createRoom}>Create room</button>
</div>
<div id="roomElem" bind:this={roomElem} style="display: {isInRoom ? "flex" : "none"}">
    <audio bind:this={audioElem} src={audioSrc}></audio>
    <div id="search" class="tab">
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
    <div id="nowPlaying" class="tab">
        <div id="nowPlayingInfo">
            {#if Object.keys(roomData).length > 0}
                {#if roomData.song.thumbnail}
                    <img alt="Thumbnail" src={roomData.song.thumbnail}>
                {:else}
                    <div class="fakeThumbnail"></div>
                {/if}
                <h2>{roomData.song.title}</h2>
                <p>{roomData.song.artist}</p>
            {/if}
        </div>
        <div id="nowPlayingControls">
            <button id="back" aria-label="Back">
                <SkipBack size={28}></SkipBack>
            </button>
            <button id="play" aria-label="Play" onclick={togglePause}>
                {#if playIcon == "play"}
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

<style>
    #home {
        padding: 16px;
    }

    #home h1 {
        margin: 0 0 16px 0;
    }

    #home button {
        margin-right: 4px;
    }

    div#roomElem {
        flex-direction: row;
    }

    div.tab {
        display: flex;
        flex-direction: column;
        padding: 16px;
        height: 100vh;
        box-sizing: border-box;
    }

    div#search {
        width: 30%;
    }

    div#searchBar {
        height: fit-content;
        width: 100%;
        display: flex;
        flex-direction: row;
        background-color: transparent;
        border-radius: 999px;
    }

    div#searchBar button {
        border-radius: 0 999px 999px 0;
        background-color: var(--background-700);
        padding: 8px 12px;
    }

    div#searchBar input {
        flex: 1;
        border-radius: 999px 0 0 999px;
        box-sizing: border-box;
        width: 0%;
        padding: 8px 0 8px 16px;
    }

    div#searchBar input:hover ~ button {
        background-color: var(--background-600);
    }

    div#searchBar input:focus ~ button {
        background-color: var(--background-700);
    }

    div#searchResults {
        margin-top: 16px;
        height: fit-content;
        width: 100%;
        overflow-y: hidden;
        border-radius: 8px;
        transition: 0.1s;
    }
    
    div#searchResultsScroll {
        height: fit-content;
        max-height: 100%;
        width: 100%;
        overflow-y: auto;
        transition: 0.1s;
    }

    button.searchResult {
        display: flex;
        flex-direction: column;
        margin-bottom: 32px;
        align-items: start;
        background-color: var(--background);
        margin: 0;
        border-radius: 0;
        width: 100%;
        box-sizing: border-box;
        padding: 16px 24px;
    }

    button.searchResult:hover {
        background-color: var(--background-800);
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

    div#nowPlayingInfo .fakeThumbnail {
        width: 100%;
        aspect-ratio: 16 / 9;
        background-color: var(--background-800);
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
        background-color: var(--background-600);
    }
</style>