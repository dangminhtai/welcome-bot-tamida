import dotenv from 'dotenv'
dotenv.config()
import { Client, GatewayIntentBits, Partials, Collection } from 'discord.js'
import path from "path";
import { fileURLToPath } from "url";
import { loadCommands, deployCommands } from './deployCommands.js'
import { connectDB } from './db.js';
import Logger from './class/Logger.js';

// Event imports
import onReady from './events/client/onReady.js';

import interactionCreate from './events/client/interactionCreate.js';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel]
});
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
client.commands = new Collection()
onReady(client);
interactionCreate(client);
import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Bot is running');
});

app.listen(PORT, () => {
    console.log(`Express server listening on port ${PORT}`);
});

async function main() {
    try {
        await connectDB();
        const commandsPath = path.join(__dirname, 'commands')
        const loadResult = await loadCommands(commandsPath, client);
        await deployCommands(loadResult);
        await client.login(process.env.DISCORD_TOKEN);
    } catch (err) {
        Logger.error(`Lỗi khi kết nối và khởi động BOT: ${err}`);
    }
}
main();
