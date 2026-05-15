<script>
    import { createAuthClient } from "better-auth/client";
    import { usernameClient } from "better-auth/client/plugins";
    import { addAlert } from "$lib/alerts";
    import "../../login-signup.css";
    import { PUBLIC_SERVER_URL } from "$env/static/public";

    let identifier = $state();
    let password = $state();
    let errorText = $state("");

    const authClient = createAuthClient({
        baseURL: PUBLIC_SERVER_URL,
        plugins: [
            usernameClient()
        ],
        fetchOptions: {
            credentials: "include"
        }
    })

    async function login() {
        if(!identifier || !password) {
            errorText = "Missing fields";
            return;
        }
        
        errorText = "";

        if(identifier.includes("@")) {
            const { data, error } = await authClient.signIn.email({
                email: identifier,
                password: password
            },
            {
                onError: (ctx) => {
                    errorText = ctx.error.message;
                },
                onSuccess: (ctx) => {
                    goto("/home");
                }
            })
        } else {
            const { data, error } = await authClient.signIn.username({
                username: identifier,
                password: password,
                callbackURL: "/home"
            },
            {
                onError: (ctx) => {
                    errorText = ctx.error.message;
                }
            })
        }
    }
</script>

<form onsubmit={login}>
    <p>Username or email</p>
    <input bind:value={identifier}>
    <p>Password</p>
    <input bind:value={password}>
    <p id="error">{errorText}</p>
    <button type="submit">Log in</button>
</form>