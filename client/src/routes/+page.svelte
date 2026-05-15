<script>
    import { goto } from "$app/navigation";
    import { createAuthClient } from "better-auth/client";
    import { usernameClient } from "better-auth/client/plugins";
    import { onMount } from "svelte";
    import { PUBLIC_SERVER_URL } from "$env/static/public";
    
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
        }
    })
</script>

<button onclick={() => goto("/login")}>Log in</button>
<button onclick={() => goto("/signup")}>Sign up</button>