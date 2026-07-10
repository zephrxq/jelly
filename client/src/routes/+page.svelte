<script>
    import { goto } from "$app/navigation";
    import { createAuthClient } from "better-auth/client";
    import { usernameClient } from "better-auth/client/plugins";
    import { onMount } from "svelte";
    import { PUBLIC_SERVER_URL } from "$env/static/public";
    import { loading, loadingText } from "$lib/stores";

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
        $loading = true;
        $loadingText = "Fetching data...";

        const session = await authClient.getSession();

        $loadingText = "Redirecting..."

        if(session.data) {
            goto("/home");
        } else {
            goto("/login");
        }
    })
</script>