<script>
    import { onMount, onDestroy, tick } from "svelte";
    import { io } from "socket.io-client";
    import { addAlert } from "$lib/alerts";
    import { goto } from "$app/navigation";

    let socket;
    let room = $state({});

    onMount(() => {
        socket = io("localhost:3000",{
            withCredentials: true
        })

        socket.on("state", () => {
            goto("/room");
        })
    })

    function joinAlert() {
        addAlert({
            title: "Join room",
            text: "Enter room ID",
            isInput: true,
            acceptEmpty: false,
            onInput: ((roomId) => {
                joinRoom(roomId)
            })
        })
    }

    function joinRoom(roomId) {
        socket.emit("join-room", roomId, (joinResult) => {
            if(joinResult.status == "fail") {
                addAlert({
                    title: "Failed to join room",
                    text: joinResult.reason
                })
            } else if(createResult.status == "success") {
                goto("/room");
            }
        })
    }
    
    function createRoom() {
        socket.emit("create-room", (createResult) => {
            console.log(createResult)
            if(createResult.status == "fail") {
                return addAlert({
                    title: "Failed to create room",
                    text: createResult.reason
                })
            } else if(createResult.status == "success") {
                goto("/room");
            }
        })
    }
</script>

<div id="home">
    <h1>Home</h1>
    <button onclick={joinAlert}>Join room</button>
    <button onclick={createRoom}>Create room</button>
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
</style>