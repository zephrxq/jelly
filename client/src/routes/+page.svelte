<script>
    import { onMount, onDestroy } from "svelte";
    import { io } from "socket.io-client";

    let socket;
    let roomId = $state();
    let roomData = $state({});
    let searchQuery = state();
    let searchResults = state([]);

    $effect(() => {
        socket = io("localhost:3000");
    })

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
        console.log(roomData)
    }

    function search() {
        if(!roomId || !searchQuery) return;

        socket.emit("search", searchQuery, (data) => {
            searchResults = data;
        })
    }

    function addSong(songData) {
        socket.emit("add-song", songData);
    }
</script>

<h1>Jelly</h1>
<input bind:value={roomId}>
<button onclick={tryJoinRoom}>Join room</button>
<input bind:value={searchQuery}>
<button onclick={search}>Search</button>
<div id="searchResults">
    {#each searchResults as searchResult, index}
        <div id="searchResult">
            <p>{searchResult.snippet.channelTitle}</p>
            <p>{searchResult.snippet.title}</p>
            <button onclick={addSong(searchResult)}>Add to queue</button>
        </div>
    {/each}
</div>