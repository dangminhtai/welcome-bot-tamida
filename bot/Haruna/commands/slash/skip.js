import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import musicPlayer from '../../utils/musicPlayer.js';
import MusicLog from '../../models/MusicLog.js';

export default {
    data: new SlashCommandBuilder().setName('skip').setDescription('Bỏ qua bài đang phát'),

    async execute(interaction) {
        try {
            const guild = interaction.guild;
            if (!guild) {
                await interaction.reply({ content: 'Lệnh chỉ dùng trong server.', flags: MessageFlags.Ephemeral });
                return;
            }

            const ok = musicPlayer.skip(guild.id);
            if (ok) {
                MusicLog.create({
                    guildId: guild.id,
                    action: 'skip',
                    requestedBy: interaction.user.tag,
                    userId: interaction.user.id,
                }).catch((e) => console.error('[MusicLog]', e));
            }
            await interaction.reply({
                content: ok ? 'Đã bỏ qua bài hiện tại.' : 'Không có bài đang phát.',
                flags: MessageFlags.Ephemeral,
            });
        } catch (err) {
            console.error('[skip]', err);
            try {
                if (interaction.deferred) {
                    await interaction.editReply({ content: 'Có lỗi khi skip.' }).catch(() => {});
                } else if (!interaction.replied) {
                    await interaction.reply({ content: 'Có lỗi khi skip.', flags: MessageFlags.Ephemeral }).catch(() => {});
                }
            } catch (_) {}
        }
    },
};
