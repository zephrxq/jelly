import dotenv from "dotenv";
dotenv.config();

import { betterAuth } from "better-auth";
import { username } from "better-auth/plugins";
import Database from "better-sqlite3";

export const db = new Database("./db.sqlite");

export const auth = betterAuth({
    database: db,
    secret: process.env.BETTER_AUTH_SECRET,
    trustedOrigins: [
        process.env.CLIENT_URL
    ],
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
