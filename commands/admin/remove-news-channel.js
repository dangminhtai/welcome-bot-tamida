import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import NewsChannel from '../../models/NewsChannel.js';

const ADMIN_ID = '1149477475001323540'; // Bot Owner

const TYPE_LABELS = {
    hoyolab: 'HoYoLAB',
    giftcode: 'Gift Codes',
    daily_checkin: 'Daily check-in'
};

function getTypeLabel(type) {
    return TYPE_LABELS[type] || type;
}

export default {
    data: new SlashCommandBuilder()
        .setName('remove-news-channel')
        .setDescription('Remove a channel from the news list so the bot stops posting (HoYoLAB, Gift Codes, Daily check-in)')
        .addStringOption(opt =>
            opt.setName('channel')
                .setDescription('Select channel to remove (shows channel name and id)')
                .setRequired(true)
                .setAutocomplete(true))
        .setDMPermission(false),

    async autocomplete(interaction) {
        const guildId = interaction.guildId;
        if (!guildId) return interaction.respond([]);

        const isAdmin = interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);
        const isOwner = interaction.user.id === ADMIN_ID;
        if (!isAdmin && !isOwner) return interaction.respond([]);

        try {
            const list = await NewsChannel.find({ guildId }).lean();
            const focused = (interaction.options.getFocused() || '').toLowerCase();

            const guild = interaction.guild;
            const choices = list.map(doc => {
                const ch = guild?.channels?.cache?.get(doc.channelId) || interaction.client.channels?.cache?.get(doc.channelId);
                const name = ch?.name ?? null;
                const typeLabel = getTypeLabel(doc.type);
                const label = name
                    ? `#${name} (${doc.channelId}) · ${typeLabel}`
                    : `(ID: ${doc.channelId}) · ${typeLabel}`;
                const nameStr = label.length > 100 ? label.slice(0, 97) + '…' : label;
                return { name: nameStr, value: `${doc.channelId}:${doc.type}` };
            });

            const filtered = focused
                ? choices.filter(c => c.name.toLowerCase().includes(focused) || c.value.toLowerCase().includes(focused))
                : choices;

            return interaction.respond(filtered.slice(0, 25));
        } catch (err) {
            console.error('[remove-news-channel] autocomplete:', err.message);
            return interaction.respond([]);
        }
    },

    async execute(interaction) {
        const isAdmin = interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);
        const isOwner = interaction.user.id === ADMIN_ID;
        if (!isAdmin && !isOwner) {
            return interaction.reply({ content: '⛔ You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
        }

        const guildId = interaction.guildId;
        if (!guildId) {
            return interaction.reply({ content: '❌ This command can only be used in a server.', flags: MessageFlags.Ephemeral });
        }

        const raw = interaction.options.getString('channel');
        if (!raw || !raw.includes(':')) {
            return interaction.reply({
                content: '❌ Invalid selection. Please choose a channel from the list.',
                flags: MessageFlags.Ephemeral
            });
        }

        const [channelId, type] = raw.split(':');
        if (!channelId || !type) {
            return interaction.reply({
                content: '❌ Invalid selection. Please choose a channel from the list.',
                flags: MessageFlags.Ephemeral
            });
        }

        try {
            const result = await NewsChannel.deleteOne({ guildId, channelId, type });

            if (result.deletedCount === 0) {
                return interaction.reply({
                    content: '❌ Entry not found or already removed.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const typeLabel = getTypeLabel(type);
            return interaction.reply({
                content: `✅ Removed <#${channelId}> from **${typeLabel}** updates. The bot will no longer post there.`,
                flags: MessageFlags.Ephemeral
            });
        } catch (error) {
            console.error('Error removing news channel:', error);
            return interaction.reply({
                content: '❌ An error occurred while removing the channel.',
                flags: MessageFlags.Ephemeral
            });
        }
    },
};
