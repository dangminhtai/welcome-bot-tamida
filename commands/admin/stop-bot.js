import { SlashCommandBuilder } from 'discord.js';
import BotProcessManager from '../../services/BotProcessManager.js';

export const data = new SlashCommandBuilder()
    .setName('stop-bot')
    .setDescription('Turn off a sub-bot (Admin only)')
    .addStringOption(option =>
        option.setName('name')
            .setDescription('Name of the bot folder (e.g., Dolia)')
            .setRequired(true)
    );

export async function execute(interaction) {
    const botName = interaction.options.getString('name');

    await interaction.deferReply({ ephemeral: true });

    try {
        const result = BotProcessManager.stopBot(botName);
        await interaction.editReply({ content: result.message });
    } catch (error) {
        console.error(`Error stopping bot ${botName}:`, error);
        await interaction.editReply({ content: '❌ An error occurred while trying to stop the bot.' });
    }
}

export default {
    data,
    execute
};
