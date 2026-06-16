<script>
    import { goto } from "$app/navigation";
    import { createAuthClient } from "better-auth/client";
    import { usernameClient } from "better-auth/client/plugins";
    import { onMount } from "svelte";
    import { PUBLIC_SERVER_URL } from "$env/static/public";
    import "../animations.css";
    
    const authClient = createAuthClient({
        baseURL: PUBLIC_SERVER_URL,
        plugins: [
            usernameClient()
        ],
        fetchOptions: {
            credentials: "include"
        }
    })

    onMount(async () => {
        const session = await authClient.getSession();

        if(session.data) {
            goto("/home");
        } else {
            goto("/login")
        }
    })
</script>

<div id="idk">
    <div class="loading"></div>
</div>

<style>
    div#idk {
        height: 100%;
        width: 100%;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
    }
</style>