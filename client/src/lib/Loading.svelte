<script>
    import { fade } from "svelte/transition";
    import { loading, loadingText } from "./stores";
    import { onNavigate } from "$app/navigation";
    
    onNavigate(async ({ complete }) => {
        $loading = true;

        complete.finally(() => {
            $loading = false;
        })
    })
</script>

{#if $loading}
    <div id="overlay" transition:fade={{ duration: 100 }}>
        <div class="loading"></div>
        <p>{$loadingText}</p>
    </div>
{/if}

<style>
    #overlay {
        height: 100vh;
        width: 100vw;
        background-color: var(--background);
        position: fixed;
        top: 0;
        left: 0;
        display: flex;
        justify-content: center;
        align-items: center;
        flex-direction: column;
    }

    @keyframes rotation {
        0% {
            transform: rotate(0deg);
        }
        100% {
            transform: rotate(360deg);
        }
    }

    div.loading {
        width: 54px;
        height: 54px;
        border: 5px solid var(--text);
        border-bottom-color: transparent;
        border-radius: 50%;
        display: inline-block;
        animation: rotation 0.75s linear infinite;
    }
</style>