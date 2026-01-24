import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import play from 'play-dl';
import musicPlayer from '../../utils/musicPlayer.js';
import MusicLog from '../../models/MusicLog.js';
import GuildMusicQueue from '../../models/GuildMusicQueue.js';

async function resolveTrack(query) {
    const v = await play.validate(query);
    if (v === 'yt_video') {
        const info = await play.video_basic_info(query);
        const title = info?.video_details?.title || 'YouTube';
        return { url: query, title };
    }
    if (v === 'so_track') {
        const so = await play.soundcloud(query);
        if (so && so.type === 'track') {
            return { url: query, title: so.name || 'SoundCloud' };
        }
    }
    const results = await play.search(query, { limit: 1, source: { youtube: 'video' } });
    if (!results || results.length === 0) return null;
    return { url: results[0].url, title: results[0].title || 'Không rõ tên' };
}

export default {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Phát nhạc từ YouTube hoặc tìm theo tên')
        .addStringOption((o) => o.setName('query').setDescription('URL hoặc tên bài hát').setRequired(true)),

    async execute(interaction) {
        console.log('[Play Command] Started execution');
        try {
            const guild = interaction.guild;
            if (!guild) {
                console.log('[Play Command] No guild');
                await interaction.reply({ content: 'Lệnh chỉ dùng trong server.', flags: MessageFlags.Ephemeral });
                return;
            }
            const voiceChannel = interaction.member?.voice?.channel;
            if (!voiceChannel) {
                console.log('[Play Command] No voice channel');
                await interaction.reply({ content: 'Bạn cần vào voice channel trước.', flags: MessageFlags.Ephemeral });
                return;
            }

            console.log('[Play Command] Deferring reply...');
            await interaction.deferReply({ ephemeral: true });

            const query = interaction.options.getString('query', true).trim();
            console.log('[Play Command] Query:', query);

            if (!query) {
                await interaction.editReply('Vui lòng nhập URL hoặc tên bài.');
                return;
            }

            console.log('[Play Command] Resolving track...');
            const track = await resolveTrack(query);
            console.log('[Play Command] Resolved track:', track);

            if (!track) {
                await interaction.editReply('Không tìm thấy bài nào.');
                return;
            }

            const guildId = guild.id;
            console.log('[Play Command] Joining voice...');
            musicPlayer.join(voiceChannel);

            console.log('[Play Command] Adding track to queue...');
            const nowPlaying = musicPlayer.addTrack(guildId, {
                url: track.url,
                title: track.title,
                requestedBy: interaction.user.tag,
            });

            const msg = nowPlaying ? `Đang phát **${track.title}**.` : `Đã thêm **${track.title}** vào queue.`;
            await interaction.editReply(msg);
            console.log('[Play Command] Done.');

            GuildMusicQueue.updateOne(
                { guildId },
                { $push: { tracks: { url: track.url, title: track.title, requestedBy: interaction.user.tag, addedAt: new Date() } }, $set: { updatedAt: new Date() } },
                { upsert: true }
            ).catch((e) => console.error('[GuildMusicQueue]', e));

            MusicLog.create({
                guildId,
                action: 'add',
                track: { url: track.url, title: track.title, requestedBy: interaction.user.tag },
                requestedBy: interaction.user.tag,
                userId: interaction.user.id,
            }).catch((e) => console.error('[MusicLog]', e));
        } catch (err) {
            console.error('[Play Command Error]', err);
            try {
                if (interaction.deferred) {
                    await interaction.editReply('Lỗi khi tìm hoặc phát (stream/nguồn không hỗ trợ).').catch((e) => console.error('Error sending error response:', e));
                } else {
                    await interaction.reply({ content: 'Lỗi khi tìm hoặc phát.', flags: MessageFlags.Ephemeral }).catch((e) => console.error('Error sending error response:', e));
                }
            } catch (_) { }
        }
    },
};
