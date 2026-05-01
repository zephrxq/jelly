<script>
    import { onMount, onDestroy, tick } from "svelte";
    import { io } from "socket.io-client";

    let socket;
    let roomId = $state();
    let roomData = $state({});
    let searchQuery = $state();
    let searchResults = $state([]);
    let audioElem = $state();
    let audioSrc = $state();
    let homeElem = $state();
    let roomElem = $state();

    onMount(() => {
        socket = io("localhost:3000");

        socket.on("play-song", (data) => {
            roomData = data;
            playSong();
        })
    })

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

    function tryJoinRoom() {
        socket.emit("join-room", roomId, (joinResult) => {
            if(joinResult.status == "success") {
                roomData = joinResult.roomData;
                joinRoom();
            } else if(joinResult.status == "fail") {
                alert("Failed ", joinResult.reason);
            }
        })
    }
    
    function joinRoom() {
        alert("Joined room ");
        playSong();
    }

    function createRoom() {
        socket.emit("create-room", (createResult) => {
            if(createResult.status == "success") {
                roomData = createResult.roomData;
                joinRoom();
            } else if(createResult.status == "fail") {
                alert("Failed ", createResult.reason);
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

<div bind:this={homeElem}>
    <input bind:value={roomId}>
    <button onclick={tryJoinRoom}>Join room</button>
    <button onclick={createRoom}>Create room</button>
</div>
<div bind:this={roomElem}>
    <audio bind:this={audioElem} src={audioSrc} controls></audio>
    <input bind:value={searchQuery}>
    <button onclick={search}>Search</button>
    <div id="searchResults">
        {#each searchResults as searchResult, index}
            <div id="searchResult">
                <p>{searchResult.snippet.channelTitle}</p>
                <p>{searchResult.snippet.title}</p>
                <button onclick={() => addSong(searchResult.id.videoId)}>Add to queue</button>
            </div>
        {/each}
    </div>
</div>