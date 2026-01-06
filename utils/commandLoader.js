import fs from "fs";
import path from "path";
import { pathToFileURL } from 'url';

const ADMIN_ID = '1149477475001323540';

async function loadCommands(client, baseDir) {
    async function load(dir, isAdmin = false) {
        const files = fs.readdirSync(dir, { withFileTypes: true });
        for (const file of files) {
            const filePath = path.join(dir, file.name);
            if (file.isDirectory()) {
                const adminMode = file.name.toLowerCase() === 'admin' || isAdmin;
                await load(filePath, adminMode);
            }
            else if (file.name.endsWith('.js')) {
                const commandModule = await import(pathToFileURL(filePath).href);
                const command = commandModule.default || commandModule;

                // ✅ Bỏ qua file không hợp lệ
                if (!command || !command.data || typeof command.data.name !== 'string') {
                    console.warn(`[WARN] Skipped invalid command file: ${filePath}`);
                    continue;
                }

                // Nếu là admin command thì bọc kiểm tra quyền
                if (isAdmin) {
                    const originalExecute = command.execute;
                    command.execute = async (interaction) => {
                        if (interaction.user.id !== ADMIN_ID) {
                            return interaction.reply({
                                content: '❌ You do not have permission to use this command.',
                                ephemeral: true
                            });
                        }
                        return originalExecute(interaction);
                    };
                }
                client.commands.set(command.data.name, command);
            }
        }
    }
    await load(baseDir);
}
export { loadCommands };
export default {
    loadCommands
};
