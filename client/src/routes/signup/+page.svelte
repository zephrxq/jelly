<script>
    import { createAuthClient } from "better-auth/client";
    import { usernameClient } from "better-auth/client/plugins";
    import { addAlert } from "$lib/alerts";
    import "../../login-signup.css";
    import { goto } from "$app/navigation";

    let name = $state();
    let username = $state();
    let email = $state();
    let password = $state();
    let errorText = $state("");

    const authClient = createAuthClient({
        baseURL: "http://localhost:3000",
        plugins: [
            usernameClient()
        ],
        fetchOptions: {
            credentials: "include"
        }
    })

    async function signup() {
        if(!email || !username || !name || !password) {
            errorText = "Missing fields";
            return;
        }
        
        errorText = "";

        const { data, error } = await authClient.signUp.email({
            username: username,
            name: name,
            email: email,
            password: password
        },
        {
            onError: (ctx) => {
                errorText = ctx.error.message;
            },
            onSuccess: (ctx) => {
                goto("/home");
            }
        },)
        
        console.log(data, error);
    }
</script>

<form>
    <p>Name</p>
    <input bind:value={name}>
    <p>Username</p>
    <input bind:value={username}>
    <p>Email</p>
    <input bind:value={email}>
    <p>Password</p>
    <input bind:value={password} type="password">
    <p id="error">{errorText}</p>
    <button onclick={signup}>Sign up</button>
</form>
