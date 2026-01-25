import { SlashCommandBuilder } from 'discord.js';
import BotProcessManager from '../../services/BotProcessManager.js';

export const data = new SlashCommandBuilder()
    .setName('start-bot')
    .setDescription('Turn on a sub-bot (Admin only)')
    .addStringOption(option =>
        option.setName('name')
            .setDescription('Name of the bot folder (e.g., Dolia)')
            .setRequired(true)
    );

export async function execute(interaction) {
    // Basic permissions check (checking specific ADMIN_ID is better if available from config, but commandLoader already handles admin check if in admin folder)
    // Assuming this file is placed in commands/admin/start-bot.js and commandLoader enforces admin check for 'admin' folder.

    const botName = interaction.options.getString('name');

    await interaction.deferReply({ ephemeral: true });

    const result = await BotProcessManager.startBot(botName);

    await interaction.editReply({ content: result.message });
}

export default {
    data,
    execute
};
