import discord from "discord.js";
import fs from "node:fs";
import path from "node:path";
import { config } from "dotenv";
const { REST, Routes } = discord;
({ config }.config());
const commands = [];
const commandsPath = path.join(__dirname, 'commands');
// Hàm đệ quy để duyệt toàn bộ thư mục con
function loadCommandsRecursively(dir) {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
        const fullPath = path.join(dir, file.name);
        if (file.isDirectory()) {
            loadCommandsRecursively(fullPath); // Gọi đệ quy nếu là thư mục
        }
        else if (file.isFile() && file.name.endsWith('.js')) {
            if ('data' in command && 'execute' in command) {
                commands.push(command.data.toJSON());
            }
            else {
                console.log(`[WARNING] The command at ${fullPath} is missing a required "data" or "execute" property.`);
            }
        }
    }
}
// Bắt đầu duyệt từ thư mục commands
loadCommandsRecursively(commandsPath);
// Thiết lập REST API
const rest = new REST().setToken(process.env.TOKEN);
// Dùng lệnh toàn cục hay trong server test?
const isGuild = !!process.env.GUILD_ID;
const route = isGuild
    ? Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)
    : Routes.applicationCommands(process.env.CLIENT_ID);
(async () => {
    try {
        console.log(`⛔ Clearing existing ${isGuild ? 'guild' : 'global'} commands...`);
        await rest.put(route, { body: [] }); // Xóa toàn bộ lệnh hiện tại
        console.log('✅ Successfully cleared all commands.');
        console.log(`🚀 Deploying ${commands.length} new ${isGuild ? 'guild' : 'global'} commands...`);
        const data = await rest.put(route, { body: commands });
        console.log(`✅ Successfully deployed ${data.length} commands.`);
    }
    catch (error) {
        console.error('❌ Error during deployment:', error);
    }
})();
