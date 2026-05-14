<script>
	import favicon from "$lib/assets/favicon.svg";
	import "../app.css";
	import { alerts, closeAlert } from "$lib/alerts.js";

	let { children } = $props();

	function onInput(alertData) {
		if(!alertData.acceptEmpty && !alertData.inputData) {
			return;
		}

		closeAlert(alertData);
		alertData.onInput(alertData.inputData);
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="preconnect" href="https://fonts.googleapis.com">
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
	<link href="https://fonts.googleapis.com/css2?family=Cabin:ital,wght@0,400..700;1,400..700&display=swap" rel="stylesheet">
</svelte:head>

{@render children()}

<div class="alerts">
	{#each $alerts as alertData}
		{console.log(JSON.stringify(alertData))}
		<div class="alert">
			<h2>{alertData.title}</h2>
			<p>{alertData.text}</p>
			{#if alertData.isInput}
				<input bind:value={alertData.inputData} onkeydown={(event) => { if(event.key == "Enter") onInput(alertData); }}>
			{/if}
			<div class="buttons">
				<button onclick={() => { closeAlert(alertData) }}>{alertData.isInput ? "Cancel" : "Close"}</button>
				{#if alertData.isInput}
					<button onclick={() => onInput(alertData)}>Continue</button>
				{/if}
			</div>
		</div>
	{/each}
</div>

<style>
    div.alerts div.alert {
        display: flex;
        flex-direction: column;
        justify-content: center;
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        height: fit-content;
        width: 25vw;
        padding: 16px 20px;
        border-radius: 8px;
        background-color: var(--background-900);
    }

    div.alert h2 {
        margin: 0 0 8px 0;
    }

    div.alert p {
        margin: 0 0 16px 0;
    }

    div.alert input {
        width: 100%;
        box-sizing: border-box;
        margin: 8px 0 16px 0;
    }

    div.alert .buttons {
        margin: 0;
        display: flex;
        flex-direction: row;
        justify-content: flex-end;
    }

    div.alert button {
        margin: 0 0 0 8px;
    }
</style>