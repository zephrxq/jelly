import { writable } from "svelte/store";

export const alerts = writable([]);

export function addAlert(data) {
    const alert = {
        id: crypto.randomUUID(),
        inputData: "",
        ...data
    }
    
    alerts.update((list) => [
        ...list,
        alert
    ])

    if(data.type == "toast") {
        setTimeout(() => {
            closeAlert(alert.id);
        }, 3000)
    }
}

export function closeAlert(alert) {
    if(alert.onClose) {
        alert.onClose();
    }
    
    alerts.update((list) => list.filter((a) => a.id !== alert.id));
}