import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import musicPlayer from '../../utils/musicPlayer.js';

export default {
    data: new SlashCommandBuilder().setName('queue').setDescription('Xem hàng chờ nhạc'),

    async execute(interaction) {
        try {
            const guild = interaction.guild;
            if (!guild) {
                await interaction.reply({ content: 'Lệnh chỉ dùng trong server.', flags: MessageFlags.Ephemeral });
                return;
            }

            const state = musicPlayer.getState(guild.id);
            if (!state || (state.queue.length === 0 && !state.currentTrack)) {
                await interaction.reply({ content: 'Không có bài trong queue.', flags: MessageFlags.Ephemeral });
                return;
            }

            const lines = [];
            if (state.currentTrack) {
                lines.push(`**Đang phát:** ${state.currentTrack.title} (${state.currentTrack.requestedBy})`);
            }
            state.queue.forEach((t, i) => {
                lines.push(`${i + 1}. ${t.title} — ${t.requestedBy}`);
            });
            const text = lines.length ? lines.join('\n') : 'Không có bài trong queue.';
            await interaction.reply({ content: text, flags: MessageFlags.Ephemeral });
        } catch (err) {
            console.error('[queue]', err);
            try {
                if (interaction.deferred) {
                    await interaction.editReply({ content: 'Có lỗi khi xem queue.' }).catch(() => {});
                } else if (!interaction.replied) {
                    await interaction.reply({ content: 'Có lỗi khi xem queue.', flags: MessageFlags.Ephemeral }).catch(() => {});
                }
            } catch (_) {}
        }
    },
};
