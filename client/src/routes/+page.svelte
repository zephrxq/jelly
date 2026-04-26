<script>
    import { onMount, onDestroy } from "svelte";
    import { io } from "socket.io-client";

    let socket;
    let roomId = $state();
    let roomData = $state({})

    $effect(() => {
        socket = io("localhost:3000");
    })

    function tryJoinRoom() {
        socket.emit("join-room", roomId, (joinResult) => {
            if(joinResult.status == "success") {
                roomData = joinResult.roomData;
                joinRoom();
            }
            if(joinResult.status == "fail") {
                alert("Failed ", joinResult.reason);
            }
        })
    }
    
    function joinRoom() {
        alert("Joined room ", roomData);
    }

</script>

<h1>Jelly</h1>
<input bind:value={roomId}>
<button onclick={tryJoinRoom}>Join room</button>