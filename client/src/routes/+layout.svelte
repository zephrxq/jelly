<script>
	import favicon from "$lib/assets/favicon.svg";
	import "../app.css";
	import { alerts } from "$lib/stores";
	import { closeAlert } from "$lib/alerts.js";
	import { fade } from "svelte/transition";
  	import Loading from "$lib/Loading.svelte";

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

<Loading></Loading>

<div class="alerts">
	{#each $alerts as alertData}
		<div class="alert" id={alertData.type} transition:fade={{ duration: 100 }}>
			<h2>{alertData.title}</h2>
			<p>{alertData.text}</p>
			{#if alertData.isInput}
				<input bind:value={alertData.inputData} onkeydown={(event) => { if(event.key == "Enter") onInput(alertData); }}>
			{/if}
			{#if alertData.type != "toast"}
				<div class="buttons">
					<button onclick={() => { closeAlert(alertData) }}>{alertData.isInput ? "Cancel" : "Close"}</button>
					{#if alertData.isInput}
						<button onclick={() => onInput(alertData)}>Continue</button>
					{/if}
				</div>
			{/if}
		</div>
	{/each}
</div>