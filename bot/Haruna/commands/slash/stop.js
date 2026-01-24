import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import musicPlayer from '../../utils/musicPlayer.js';
import MusicLog from '../../models/MusicLog.js';
import GuildMusicQueue from '../../models/GuildMusicQueue.js';

export default {
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Dừng phát nhạc, xóa queue và thoát voice'),

    async execute(interaction) {
        try {
            const guild = interaction.guild;
            if (!guild) {
                await interaction.reply({ content: 'Lệnh chỉ dùng trong server.', flags: MessageFlags.Ephemeral });
                return;
            }

            const ok = musicPlayer.stop(guild.id);
            if (ok) {
                GuildMusicQueue.updateOne(
                    { guildId: guild.id },
                    { $set: { tracks: [], updatedAt: new Date() } },
                    { upsert: true }
                ).catch((e) => console.error('[GuildMusicQueue]', e));
                MusicLog.create({
                    guildId: guild.id,
                    action: 'stop',
                    requestedBy: interaction.user.tag,
                    userId: interaction.user.id,
                }).catch((e) => console.error('[MusicLog]', e));
            }
            await interaction.reply({
                content: ok ? 'Đã dừng và thoát voice.' : 'Không có gì đang phát.',
                flags: MessageFlags.Ephemeral,
            });
        } catch (err) {
            console.error('[stop]', err);
            try {
                if (interaction.deferred) {
                    await interaction.editReply({ content: 'Có lỗi khi dừng.' }).catch(() => {});
                } else if (!interaction.replied) {
                    await interaction.reply({ content: 'Có lỗi khi dừng.', flags: MessageFlags.Ephemeral }).catch(() => {});
                }
            } catch (_) {}
        }
    },
};
