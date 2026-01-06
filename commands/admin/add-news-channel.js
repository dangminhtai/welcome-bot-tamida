import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import NewsChannel from '../../models/NewsChannel.js';

export default {
    data: new SlashCommandBuilder()
        .setName('add-news-channel')
        .setDescription('Configure this channel to receive news/updates')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Type of news to receive')
                .setRequired(true)
                .addChoices(
                    { name: 'HoYoLAB News', value: 'hoyolab' },
                    { name: 'Gift Codes', value: 'giftcode' }
                ))
        .setDMPermission(false),

    async execute(interaction) {
        const type = interaction.options.getString('type');
        const channelId = interaction.channelId;
        const guildId = interaction.guildId;

        // Custom Permission Check
        // Allow: Server Administrators OR Bot Owner
        const ADMIN_ID = '1149477475001323540'; // Bot Owner
        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        const isOwner = interaction.user.id === ADMIN_ID;

        if (!isAdmin && !isOwner) {
            return interaction.reply({ content: '⛔ You do not have permission to configure this bot.', flags: MessageFlags.Ephemeral });
        }

        if (!guildId) {
            return interaction.reply({ content: '❌ This command can only be used in a server.', flags: MessageFlags.Ephemeral });
        }

        try {
            // Check if already exists
            const existing = await NewsChannel.findOne({ guildId, channelId, type });
            if (existing) {
                return interaction.reply({
                    content: `⚠️ This channel is already configured for **${type}**.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            // Create new config
            await NewsChannel.create({
                guildId,
                channelId,
                type,
                addedBy: interaction.user.id
            });

            await interaction.reply({
                content: `✅ Successfully added <#${channelId}> to receive **${type}** updates!`,
                flags: MessageFlags.Ephemeral
            });

        } catch (error) {
            console.error('Error adding news channel:', error);
            await interaction.reply({
                content: '❌ An error occurred while saving configuration.',
                flags: MessageFlags.Ephemeral
            });
        }
    },
};
