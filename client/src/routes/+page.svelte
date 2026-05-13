<script>
    import { createAuthClient } from "better-auth/client";
    import { usernameClient } from "better-auth/client/plugins";

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
        const { data, error } = await authClient.signUp.email({
            name: "Zeph",
            password: "password1234",
            username: "zeph",
            email: "zephrequilme19@gmail.com"
        })
    }

    async function login() {
        const { data, error } = await authClient.signIn.username({
            password: "password1234",
            email: "zephrequilme19@gmail.com",
            username: "zeph"
        })
    }
</script>

<button onclick={login}>Log in</button>
<button onclick={signup}>Sign up</button>