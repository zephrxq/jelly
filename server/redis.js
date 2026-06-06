import { unlink } from "fs";
import { createClient } from "redis";

export const client = createClient();

await client.connect();
await client.subscribe("__keyevent@0__:expired", async (key) => {
    if(key.startsWith("song-file:")) {
        const songPath = await client.get(key);

        try {
            await unlink(songPath);
        } catch {
            console.log(`Failed to delete ${songPath}`);
        }
    }
})