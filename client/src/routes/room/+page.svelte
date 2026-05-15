<script>
    import { onMount, onDestroy, tick } from "svelte";
    import { io } from "socket.io-client";
    import { addAlert } from "$lib/alerts.js";
    import Play from "@lucide/svelte/icons/play";
    import Pause from "@lucide/svelte/icons/pause";
    import SkipBack from "@lucide/svelte/icons/skip-back";
    import SkipForward from "@lucide/svelte/icons/skip-forward";
    import Search from "@lucide/svelte/icons/search";
    import { PUBLIC_SERVER_URL } from "$env/static/public";

    let socket;
    let room = $state({});
    let searchQuery = $state();
    let searchResults = $state([]);
    let audioElem = $state();
    let audioSrc = $state();
    let playIcon = $state("play");

    onMount(() => {
        socket = io(PUBLIC_SERVER_URL, {
            withCredentials: true
        })

        socket.on("state", (state) => {
            stateUpdate(state);
            console.log(state)
        })
    })

    function stateUpdate(state) {
        room = state;
        
        if(state.status == "playing" && audioElem.paused) {
            audioElem.play();
        } else if(state.status != "playing" && !audioElem.paused) {
            audioElem.pause();
        }

        if(room.song.id) {
            const serverTime = (Date.now() - room.startTime) / 1000;
            const drift = Math.abs(audioElem.currentTime - serverTime);

            if (drift > 0.5) {
                audioElem.currentTime = serverTime;
            }
        }

        if(audioSrc != room.song.url) {
            audioSrc = room.song.url;
            audioElem.onloadedmetadata = () => {
                audioElem.play();
            }
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
</script>

<div id="room">
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
            <div id="thumbnail">
                <img alt="Thumbnail" src={room.song?.thumbnail} hidden={!room.song?.thumbnail}>
            </div>
            <h2>{room.song?.title}</h2>
            <p>{room.song?.artist}</p>
        </div>
        <div id="nowPlayingControls">
            <button id="back" aria-label="Back">
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
    <div id="members" class="tab">
        <h2>Members</h2>
        {#each room.members as member}
            <div class="member">
                <p>{member.username}</p>
            </div>
        {/each}
    </div>
</div>

<style>
    div#room {
        display: flex;
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
        background-color: var(--background-700);
        border-radius: 999px;
    }

    div#searchBar button {
        border-radius: 0 999px 999px 0;
        background-color: inherit;
        padding: 8px 12px;
    }

    div#searchBar input {
        flex: 1;
        border-radius: 999px 0 0 999px;
        box-sizing: border-box;
        width: 0%;
        padding: 8px 0 8px 16px;
        background-color: inherit;
        box-shadow: none;
    }

    div#searchBar input:hover {
        box-shadow: none;
    }

    div#searchBar:has(input:hover) {
        background-color: var(--background-600);
    }

    div#searchBar:has(input:focus) {
        background-color: var(--background-700);
        box-shadow: 0px 0px 0px 1px var(--background-200);
    }

    div#searchResults {
        margin-top: 16px;
        height: fit-content;
        width: 100%;
        overflow-y: hidden;
        border-radius: 8px;
        transition: 0.1s;
        box-shadow: 0px 0px 0px 0.25px var(--background-200);
    }
    
    div#searchResults:has(div#searchResultsScroll:empty) {
        box-shadow: none;
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

    div#nowPlayingInfo #thumbnail {
        height: fit-content;
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

    div#members {
        display: flex;
        flex-direction: column;
        width: 20%;
    }

    div#members > h2 {
        margin: 0 0 16px 0;
    }

    div.member {
        display: flex;
        flex-direction: column;
    }

    div.member p {
        margin: 0;
        font-weight: 500;
    }
</style>