import { Poru } from 'poru';
import RadioSong from '../models/RadioSong.js';
import MusicLog from '../models/MusicLog.js';
// Chỉ giữ lại Node "vàng" đã kết nối thành công
const nodes = [
    {
        name: 'Serenetia-V4',
        host: 'lavalinkv4.serenetia.com',
        port: 443,
        password: 'https://dsc.gg/ajidevserver',
        secure: true,
    }
];

export let poru;
let client;



// Hàm lấy 1 bài ngẫu nhiên từ DB
async function getRandomTrack() {
    // Lấy ngẫu nhiên 1 document từ MongoDB
    const randomSong = await RadioSong.aggregate([{ $sample: { size: 1 } }]);
    return randomSong.length > 0 ? randomSong[0] : null;
}

export function initLavalink(discordClient) {
    client = discordClient;
    // ... (Giữ nguyên đoạn new Poru và poru.init) ...
    poru = new Poru(client, nodes, {
        library: 'discord.js',
        defaultPlatform: 'ytsearch',
        reconnectTries: Infinity,
    });
    poru.init(client);

    // ... (Giữ nguyên các event nodeConnect, nodeDisconnect, trackStart) ...
    poru.on('nodeConnect', node => console.log(`✅ [Lavalink] Node ${node.name} Ready!`));

    // SỬA SỰ KIỆN NÀY
    poru.on('trackStart', async (player, track) => {
        const channel = client.channels.cache.get(player.textChannel);

        // 1. Gửi thông báo Discord
        if (channel) {
            // Tạo thanh thời gian đơn giản
            const duration = track.info.length;
            // Nếu là livestream thì không hiện thời gian
            const timeString = track.info.isStream ? "🔴 LIVE" : new Date(duration).toISOString().slice(14, 19);

            channel.send(`🎶 Đang phát: **${track.info.title}** \`[${timeString}]\`\n👤 Yêu cầu bởi: **${track.info.requester.tag || client.user.tag}**`);
        }

        // 2. GHI LOG VÀO MONGODB (QUAN TRỌNG)
        try {
            await MusicLog.create({
                guildId: player.guildId,
                channelId: player.textChannel,
                trackTitle: track.info.title,
                trackUrl: track.info.uri,
                trackAuthor: track.info.author,
                duration: track.info.length,
                requesterId: track.info.requester?.id || client.user.id, // Nếu ko có user thì là bot (24/7)
                requesterTag: track.info.requester?.tag || client.user.tag,
                isAutoPlay: player.isAutoplay || false // Đánh dấu nếu là nhạc 24/7
            });
            console.log(`💾 [DB Saved] Đã lưu log bài: ${track.info.title}`);
        } catch (err) {
            console.error('❌ Lỗi khi lưu MusicLog:', err);
        }
    });

    // --- SỬA SỰ KIỆN NÀY ĐỂ CHẠY 24/7 ---
    poru.on('queueEnd', async (player) => {
        const channel = client.channels.cache.get(player.textChannel);

        // Kiểm tra xem player này có đang bật chế độ 24/7 không?
        // (Biến isAutoplay này ta sẽ gán bằng true trong lệnh play-247)
        if (player.isAutoplay) {

            // 1. Lấy bài ngẫu nhiên từ DB
            const songData = await getRandomTrack();

            if (!songData) {
                if (channel) channel.send('⚠️ Kho nhạc Radio đang trống! Hãy dùng lệnh `/radio-add` để thêm nhạc.');
                player.isAutoplay = false; // Tắt chế độ 24/7
                player.destroy();
                return;
            }

            // 2. Resolve bài hát
            const res = await poru.resolve({ query: songData.url, source: 'ytsearch', requester: client.user });

            if (res.loadType !== 'LOAD_FAILED' && res.loadType !== 'NO_MATCHES') {
                const track = res.tracks[0];
                track.info.requester = client.user; // Người yêu cầu là Bot

                // 3. Thêm vào hàng chờ và phát
                player.queue.add(track);
                player.play();
                if (channel) channel.send(`📻 **Radio 24/7:** Đang phát ngẫu nhiên bài **${songData.title}**`);
                return; // QUAN TRỌNG: Return để không chạy dòng destroy() bên dưới
            }
        }

        // Nếu không phải 24/7 thì tắt như thường
        if (channel) channel.send('👋 Hết nhạc rồi, bot nghỉ ngơi đây!');
        player.destroy();
    });
}
