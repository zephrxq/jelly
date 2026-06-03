import { access, constants } from "fs/promises";

export async function fileExists(path) {
    try {
        await access(path, constants.F_OK);
        return true;
    } catch(error) {
        console.log(error)
        return false;
    }
}