import { SlashCommandBuilder } from 'discord.js';
import { poru } from '../../utils/LavalinkManager.js'; // Import cái biến poru vừa tạo
import { applyAudioSettings } from '../../utils/AudioController.js';
export default {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Phát nhạc theo người dùng yêu cầu')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('Tên bài hoặc Link')
                .setRequired(true)
        ),

    async execute(interaction) {
        // 1. Kiểm tra voice channel
        const member = interaction.member;
        const voiceChannel = member.voice.channel;

        if (!voiceChannel) {
            return interaction.reply({ content: '❌ Vui lòng vào kênh voice trước khi sử dụng lệnh này!', ephemeral: true });
        }

        await interaction.deferReply();
        const query = interaction.options.getString('query');

        // 2. Tìm nhạc qua Lavalink (Nó tự tìm YouTube, Spotify, SoundCloud...)
        const res = await poru.resolve({ query: query, source: 'ytsearch', requester: interaction.user });

        if (res.loadType === 'LOAD_FAILED') {
            return interaction.editReply('❌ Lỗi khi tải nhạc rồi.');
        } else if (res.loadType === 'NO_MATCHES') {
            return interaction.editReply('❌ Không tìm thấy bài nào!');
        }

        // 3. Tạo Player kết nối vào kênh voice
        const player = poru.createConnection({
            guildId: interaction.guild.id,
            voiceChannel: voiceChannel.id,
            textChannel: interaction.channel.id,
            deaf: false,
        });
        await applyAudioSettings(player);
        // 4. Xử lý kết quả (Playlist hoặc bài đơn)
        if (res.loadType === 'PLAYLIST_LOADED') {
            for (const track of res.tracks) {
                track.info.requester = interaction.user;
                player.queue.add(track);
            }
            await interaction.editReply(`✅ Đã thêm playlist **${res.playlistInfo.name}** (${res.tracks.length} bài)`);
        } else {
            // TRACK_LOADED hoặc SEARCH_RESULT
            const track = res.tracks[0];
            track.info.requester = interaction.user;
            player.queue.add(track);
            await interaction.editReply(`✅ Đã thêm vào hàng chờ: **${track.info.title}**`);
        }

        // 5. Nếu chưa phát thì phát luôn
        if (!player.isPlaying && !player.isPaused) {
            player.play();
        }
    },
};