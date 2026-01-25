import dotenv from 'dotenv';
dotenv.config();
import fs from 'fs';
import path from 'path';
import { REST, Routes } from 'discord.js';
import { pathToFileURL } from 'url';
import { commandChanges } from './utils/compareCommands.js';

async function loadCommands(dir, client) {
    const commandsToDeploy = []; // This will hold ALL commands
    let hasChanges = false;

    const files = fs.readdirSync(dir, { withFileTypes: true });

    for (const file of files) {
        const fullPath = path.join(dir, file.name);

        if (file.isDirectory()) {
            const subResult = await loadCommands(fullPath, client);
            commandsToDeploy.push(...subResult.commands);
            if (subResult.hasChanges) hasChanges = true;
        } else if (file.isFile() && file.name.endsWith('.js')) {
            const modulePath = pathToFileURL(fullPath).href;
            const commandModule = await import(modulePath);
            const cmd = commandModule.default ?? commandModule;

            if ('data' in cmd && 'execute' in cmd) {
                client?.commands?.set(cmd.data.name, cmd);

                const cmdData = cmd.data.toJSON();
                commandsToDeploy.push(cmdData);

                // Check if this specific command changed
                const changed = await commandChanges(cmd);
                if (changed) hasChanges = true;
            }
        }
    }

    return { commands: commandsToDeploy, hasChanges };
}

async function deployCommands(loadResult) {
    const { commands, hasChanges } = loadResult;

    if (commands.length === 0) return;
    if (!hasChanges) {
        console.log('✅ No command changes detected. Skipping deployment.');
        return;
    }

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        console.log(`🚀 Deploying ${commands.length} commands...`);
        const data = await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands }
        );
        console.log(`✅ Successfully deployed ${data.length} command(s).`);
    } catch (error) {
        console.error('❌ Error during deployment:', error);
    }
}

export { loadCommands, deployCommands };
