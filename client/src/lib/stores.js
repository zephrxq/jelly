import { writable } from "svelte/store";

export const alerts = writable([]);
export const loading = writable(false);
export const loadingText = writable("");