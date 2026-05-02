<script>
    import { onMount, onDestroy, tick } from "svelte";
    import { io } from "socket.io-client";
    import Alert from "$lib/Alert.svelte";

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
    
    let alerts = $state([]);

    onMount(() => {
        socket = io("localhost:3000");

        socket.on("play-song", (data) => {
            roomData = data;
            playSong();
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
        if(Object.keys(roomData.song).length == 0) {
            return;
        }

        audioSrc = roomData.song.url;
        audioElem.onloadedmetadata = () => {
            audioElem.currentTime = (Date.now() - roomData.song.timeStart) / 1000;
            audioElem.play();
        }
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
            searchResults = data;
        })
    }

    function addSong(songId) {
        socket.emit("add-song", songId);
    }
</script>

{#each alerts as alertData, index}
    <Alert alertData={alertData} onClose={() => { removeAlert(index) }}></Alert>
{/each}

<div class="home" bind:this={homeElem} hidden={isInRoom}>
    <h1>Home</h1>
    <button onclick={joinAlert}>Join room</button>
    <button onclick={createRoom}>Create room</button>
</div>
<div bind:this={roomElem} hidden={!isInRoom}>
    <audio bind:this={audioElem} src={audioSrc}></audio>
    <input bind:value={searchQuery}>
    <button onclick={search}>Search</button>
    <div id="searchResults">
        {#each searchResults as searchResult, index}
            <div id="searchResult">
                <p>{decodeHtml(searchResult.snippet.channelTitle)}</p>
                <p>{decodeHtml(searchResult.snippet.title)}</p>
                <button onclick={() => addSong(searchResult.id.videoId)}>Add to queue</button>
            </div>
        {/each}
    </div>
</div>

<style>
    .home {
        padding: 0 32px;
    }

    h1 {
        margin-top: 32px;
    }
</style>