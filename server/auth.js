import { betterAuth } from "better-auth";
import { username } from "better-auth/plugins";
import Database from "better-sqlite3";

export const db = new Database("./db.sqlite");

export const auth = betterAuth({
    database: db,
    secret: process.env.BETTER_AUTH_SECRET,
    trustedOrigins: ["http://localhost:5173"],
    baseURL: "http://localhost:3000",
    emailAndPassword: {
        enabled: true,
        minPasswordLength: 8
    },
    plugins: [
        username({
            requireEmail: false,
        })
    ]
})
