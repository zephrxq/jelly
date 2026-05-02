<script>
    let { alertData, onClose } = $props();
    let inputData = $state();

    function onInput() {
        onClose();
        alertData.onInput(inputData);
    }
</script>

<div class="alert">
    <h2>{alertData.title}</h2>
    <p>{alertData.text}</p>
    {#if alertData.isInput}
        <input bind:value={inputData}>
    {/if}
    <div class="buttons">
        <button onclick={onClose}>{alertData.isInput ? "Cancel" : "Close"}</button>
        {#if alertData.isInput}
            <button onclick={onInput}>Continue</button>
        {/if}
    </div>
</div>

<style>
    div.alert {
        display: flex;
        flex-direction: column;
        justify-content: center;
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        height: fit-content;
        width: 30vw;
        padding: 32px;
        border-radius: 8px;
        background-color: var(--background-900);
    }

    h2 {
        margin: 0 0 8px 0;
    }

    p {
        margin: 0 0 16px 0;
    }

    .buttons {
        margin: 16px 0 0 0;
        display: flex;
        flex-direction: row;
        justify-content: flex-end;
    }

    button {
        margin: 0 0 0 8px;
    }

    input {
        width: 100%;
        box-sizing: border-box;
    }
</style>