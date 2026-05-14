import { writable } from "svelte/store";

export const alerts = writable([]);

export function addAlert(data) {
    alerts.update((list) => [
        ...list,
        {
            inputData: "",
            ...data
        }
    ])
}

export function closeAlert(alertData) {
    alerts.update((list) => list.filter((alert) => alert !== alertData));
}