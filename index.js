import { config as dotenvConfig } from "dotenv";
import express from "express";
import discord from "discord.js";
import path from "path";
import { fileURLToPath } from 'url';

import connectDB from "./db.js";
import { loadCommands } from "./utils/commandLoader.js";
import { loadEvents } from "./utils/loaders/eventLoader.js";
import "./utils/keepAliveService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenvConfig();

const { Client, GatewayIntentBits, Partials, Collection } = discord;

// === 1. Initialize Discord Client ===
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
    ],
    partials: [Partials.Channel, Partials.Message, Partials.User, Partials.GuildMember]
});

// === 2. Setup Client Command Collection ===
client.commands = new Collection();

// === 3. Main Boostrap Function ===
async function bootstrap() {
    try {
        console.log("🚀 Starting Bot...");

        // Connect Database
        await connectDB();

        // Load Commands
        await loadCommands(client, path.join(__dirname, 'commands'));

        // Load Events (Recursive load from events directory)
        // Note: interactionCreate.js is in events/, so it will be loaded here.
        // Also ready.js, guildMemberAdd.js, etc.
        await loadEvents(client, path.join(__dirname, 'events'));

        // Start Keep-Alive Server
        const app = express();
        app.get('/', (req, res) => res.send('Bot is running!'));
        app.listen(process.env.PORT || 8080, () => {
            console.log(`Ping server running on port ${process.env.PORT || 8080}`);
        });

        // Login
        await client.login(process.env.TOKEN);

    } catch (error) {
        console.error("❌ Fatal Error during startup:", error);
    }
}

bootstrap();
