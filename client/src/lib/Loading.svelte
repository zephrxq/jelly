<script>
    import { fade } from "svelte/transition";
    import { loading, loadingText } from "./stores";
    import { onNavigate } from "$app/navigation";
    
    onNavigate(async ({ complete }) => {
        $loading = true;

        try {
            await complete;
        } finally {
            $loading = false;
        }
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
</style>