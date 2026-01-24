import { SlashCommandBuilder } from 'discord.js';
import { poru } from '../../utils/LavalinkManager.js';
import { applyAudioSettings } from '../../utils/AudioController.js';
import GuildMusicQueue from '../../models/GuildMusicQueue.js'; // Import Model

export default {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Phát nhạc theo yêu cầu')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('Tên bài hoặc Link')
                .setRequired(true)
        ),

    async execute(interaction) {
        const member = interaction.member;
        const voiceChannel = member.voice.channel;

        if (!voiceChannel) {
            return interaction.reply({ content: '❌ Vui lòng vào kênh voice trước khi sử dụng lệnh này!', ephemeral: true });
        }

        await interaction.deferReply();
        const query = interaction.options.getString('query');

        // 1. Tạo hoặc lấy kết nối
        let player = poru.players.get(interaction.guild.id);
        if (!player) {
            player = poru.createConnection({
                guildId: interaction.guild.id,
                voiceChannel: voiceChannel.id,
                textChannel: interaction.channel.id,
                deaf: false,
            });
            await applyAudioSettings(player);
        }

        // 2. Tìm nhạc (Có Try-Catch để chặn lỗi Bad Gateway)
        let res;
        try {
            res = await poru.resolve({ query: query, source: 'ytsearch', requester: interaction.user });
        } catch (error) {
            console.error('Lavalink Resolve Error:', error);
            return interaction.editReply('❌ Node nhạc đang bị lỗi (Bad Gateway). Vui lòng thử lại sau hoặc báo Admin đổi Node!');
        }

        // 3. Kiểm tra kết quả
        if (!res || res.loadType === 'LOAD_FAILED') {
            return interaction.editReply('❌ Lỗi khi tải nhạc.');
        } else if (res.loadType === 'NO_MATCHES') {
            return interaction.editReply('❌ Không tìm thấy bài nào!');
        }

        // 4. Xử lý thêm nhạc & Lưu Database
        const tracksToAdd = [];

        // Nếu là Playlist
        if (res.loadType === 'PLAYLIST_LOADED') {
            for (const track of res.tracks) {
                track.info.requester = interaction.user;
                player.queue.add(track); // Thêm vào Poru Queue (RAM)

                // Chuẩn bị data lưu DB
                tracksToAdd.push({
                    title: track.info.title,
                    url: track.info.uri,
                    author: track.info.author,
                    duration: track.info.length,
                    requester: interaction.user.tag
                });
            }
            await interaction.editReply(`✅ Đã thêm Playlist **${res.playlistInfo.name}** (${res.tracks.length} bài) vào hàng chờ.`);
        }
        // Nếu là bài đơn
        else {
            const track = res.tracks[0];
            track.info.requester = interaction.user;
            player.queue.add(track); // Thêm vào Poru Queue (RAM)

            tracksToAdd.push({
                title: track.info.title,
                url: track.info.uri,
                author: track.info.author,
                duration: track.info.length,
                requester: interaction.user.tag
            });

            // Logic phản hồi thông minh
            if (player.isPlaying || player.isPaused) {
                await interaction.editReply(`✅ Đã thêm vào hàng chờ (Vị trí #${player.queue.length}): **${track.info.title}**`);
            } else {
                await interaction.editReply(`▶️ Đang phát: **${track.info.title}**`);
            }
        }

        // 5. Lưu vào MongoDB (Chạy ngầm không cần await để bot phản hồi nhanh)
        GuildMusicQueue.updateOne(
            { guildId: interaction.guild.id },
            {
                $push: { tracks: { $each: tracksToAdd } },
                $set: { updatedAt: new Date() }
            },
            { upsert: true }
        ).catch(e => console.error('Lỗi lưu Queue DB:', e));

        // 6. Kích hoạt phát nhạc nếu bot đang rảnh
        if (!player.isPlaying && !player.isPaused) {
            player.play();
        }
    },
};