import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import discord from 'discord.js';
import { config } from 'dotenv';

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const commandsPath = path.join(__dirname, 'commands');
const commands = [];

// Hàm đệ quy load commands
async function loadCommandsRecursively(dir) {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
        const fullPath = path.join(dir, file.name);
        if (file.isDirectory()) {
            await loadCommandsRecursively(fullPath);
        } else if (file.isFile() && file.name.endsWith('.js')) {
            const commandModule = await import(`file://${fullPath}`);
            const command = commandModule.default || commandModule;
            if ('data' in command && 'execute' in command) {
                commands.push(command.data.toJSON());
            } else {
                console.log(`[WARNING] The command at ${fullPath} is missing "data" or "execute".`);
            }
        }
    }
}

await loadCommandsRecursively(commandsPath);

const { REST, Routes } = discord;
const rest = new REST().setToken(process.env.TOKEN);
const isGuild = !!process.env.GUILD_ID;
const route = isGuild
    ? Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)
    : Routes.applicationCommands(process.env.CLIENT_ID);

(async () => {
    try {
        console.log(`⛔ Clearing existing ${isGuild ? 'guild' : 'global'} commands...`);
        await rest.put(route, { body: [] });
        console.log('✅ Successfully cleared all commands.');
        console.log(`🚀 Deploying ${commands.length} new ${isGuild ? 'guild' : 'global'} commands...`);
        const data = await rest.put(route, { body: commands });
        console.log(`✅ Successfully deployed ${data.length} commands.`);
    } catch (error) {
        console.error('❌ Error during deployment:', error);
    }
})();
