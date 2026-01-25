import { SlashCommandBuilder } from 'discord.js';
import { poru } from '../../utils/LavalinkManager.js';
import { applyAudioSettings } from '../../utils/AudioController.js';
import GuildMusicQueue from '../../models/GuildMusicQueue.js';

export default {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Phát nhạc theo yêu cầu')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('Tên bài hát hoặc Link')
                .setRequired(true)
        )
        // --- THÊM TÙY CHỌN ƯU TIÊN ---
        .addBooleanOption(option =>
            option.setName('priority')
                .setDescription('True = Ngắt bài đang hát để phát bài này NGAY LẬP TỨC')
                .setRequired(false)
        ),

    async execute(interaction) {
        const member = interaction.member;
        const voiceChannel = member.voice.channel;

        if (!voiceChannel) {
            return interaction.reply({ content: '❌ Vui lòng vào voice trước khi sử dụng lệnh này!', ephemeral: true });
        }

        await interaction.deferReply();
        const query = interaction.options.getString('query');
        // Lấy tùy chọn ưu tiên (Mặc định là false)
        const isPriority = interaction.options.getBoolean('priority') || false;

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

        // 2. Tìm nhạc
        let res;
        try {
            res = await poru.resolve({ query: query, source: 'ytsearch', requester: interaction.user });
        } catch (error) {
            console.error('Lavalink Resolve Error:', error);
            return interaction.editReply('❌ Không lấy được bài hát, vui lòng thử lại sau');
        }

        if (!res || res.loadType === 'LOAD_FAILED') {
            return interaction.editReply('❌ Lỗi khi tải nhạc.');
        } else if (res.loadType === 'NO_MATCHES') {
            return interaction.editReply('❌ Không tìm thấy bài nào!');
        }

        // 3. Xử lý thêm nhạc
        const tracksToAdd = [];
        let msg = '';

        // Hàm format data để lưu DB
        const formatTrackForDB = (track) => ({
            title: track.info.title,
            url: track.info.uri,
            author: track.info.author,
            duration: track.info.length,
            requester: interaction.user.tag,
            addedAt: new Date()
        });

        // --- TRƯỜNG HỢP 1: PLAYLIST ---
        if (res.loadType === 'PLAYLIST_LOADED') {
            for (const track of res.tracks) {
                track.info.requester = interaction.user;
                tracksToAdd.push(formatTrackForDB(track));
            }

            if (isPriority) {
                // Đưa playlist lên đầu hàng chờ
                // Duyệt ngược để giữ đúng thứ tự playlist khi unshift
                for (let i = res.tracks.length - 1; i >= 0; i--) {
                    player.queue.unshift(res.tracks[i]);
                }
                msg = `Đã chèn bài hát **${res.playlistInfo.name}** lên đầu! Đang chuyển bài...`;
            } else {
                player.queue.add(res.tracks);
                msg = `Đã thêm bài hát **${res.playlistInfo.name}** (${res.tracks.length} bài) vào hàng chờ.`;
            }
        }
        // --- TRƯỜNG HỢP 2: BÀI ĐƠN ---
        else {
            const track = res.tracks[0];
            track.info.requester = interaction.user;
            tracksToAdd.push(formatTrackForDB(track));

            if (isPriority) {
                // Chen lên đầu hàng chờ
                player.queue.unshift(track);
                msg = `Đã chèn bài hát **${track.info.title}**! Đang ngắt bài cũ để phát ngay...`;
            } else {
                // Xếp hàng cuối
                player.queue.add(track);
                if (player.isPlaying || player.isPaused) {
                    msg = `Đã thêm bài hát **${track.info.title}** vào hàng chờ.`;
                } else {
                    msg = `Đang phát: **${track.info.title}**`;
                }
            }
        }

        await interaction.editReply(msg);

        // 4. Lưu vào MongoDB
        // Nếu ưu tiên -> Chèn vào vị trí 0 ($position: 0)
        // Nếu không -> Chèn vào cuối (Mặc định)
        const updateQuery = isPriority
            ? { $push: { tracks: { $each: tracksToAdd, $position: 0 } } }
            : { $push: { tracks: { $each: tracksToAdd } } };

        GuildMusicQueue.updateOne(
            { guildId: interaction.guild.id },
            {
                ...updateQuery,
                $set: { updatedAt: new Date() }
            },
            { upsert: true }
        ).catch(e => console.error('Lỗi lưu Queue DB:', e));

        // 5. KÍCH HOẠT PHÁT NHẠC
        if (isPriority) {
            // Nếu là ưu tiên: Bắt buộc Skip bài đang hát (để bài vừa chèn ở vị trí 0 được phát ngay)
            if (player.isPlaying || player.isPaused) {
                player.skip();
            } else {
                player.play();
            }
        } else {
            // Nếu không ưu tiên: Chỉ phát nếu bot đang rảnh
            if (!player.isPlaying && !player.isPaused) {
                player.play();
            }
        }
    },
};