import { Poru } from 'poru';
import RadioSong from '../models/RadioSong.js';
import MusicLog from '../models/MusicLog.js';
import GuildMusicQueue from '../models/GuildMusicQueue.js';
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


// Hàm hỗ trợ: Lấy 1 bài hát ngẫu nhiên từ kho nhạc Radio
async function getRandomTrack() {
    const randomSong = await RadioSong.aggregate([{ $sample: { size: 1 } }]);
    return randomSong.length > 0 ? randomSong[0] : null;
}

export function initLavalink(discordClient) {
    client = discordClient;

    // 1. Khởi tạo Poru
    poru = new Poru(client, nodes, {
        library: 'discord.js',
        defaultPlatform: 'ytsearch',
        reconnectTries: Infinity, // Cố gắng kết nối lại mãi mãi nếu rớt mạng
    });

    // 2. Kích hoạt
    poru.init(client);

    // --- CÁC SỰ KIỆN KẾT NỐI NODE ---
    poru.on('nodeConnect', node => console.log(`✅ [Lavalink] Node ${node.name} đã kết nối thành công!`));

    poru.on('nodeDisconnect', node => console.log(`❌ [Lavalink] Mất kết nối Node: ${node.name}`));

    poru.on('nodeError', (node, error) => console.log(`⚠️ [Lavalink] Node ${node.name} gặp lỗi: ${error.message}`));

    // --- SỰ KIỆN KHI BẮT ĐẦU PHÁT NHẠC (TRACK START) ---
    poru.on('trackStart', async (player, track) => {
        const channel = client.channels.cache.get(player.textChannel);

        // A. Gửi thông báo Discord
        if (channel) {
            const duration = track.info.length;
            const timeString = track.info.isStream ? "🔴 LIVE" : new Date(duration).toISOString().slice(14, 19);
            const requester = track.info.requester?.tag || client.user.tag;

            channel.send(`🎶 Đang phát: **${track.info.title}** \`[${timeString}]\`\n👤 Yêu cầu bởi: **${requester}**`);
        }

        // B. Đồng bộ Queue DB: Xóa bài đang phát khỏi danh sách chờ trong DB
        try {
            await GuildMusicQueue.updateOne(
                { guildId: player.guildId },
                { $pop: { tracks: -1 } } // Xóa phần tử đầu tiên (First In First Out)
            );
        } catch (e) {
            console.error('⚠️ Lỗi đồng bộ Queue DB:', e);
        }

        // C. Ghi Log vào Database (Lịch sử nghe nhạc)
        try {
            await MusicLog.create({
                guildId: player.guildId,
                channelId: player.textChannel,
                trackTitle: track.info.title,
                trackUrl: track.info.uri,
                trackAuthor: track.info.author,
                duration: track.info.length,
                requesterId: track.info.requester?.id || client.user.id,
                requesterTag: track.info.requester?.tag || client.user.tag,
                isAutoPlay: player.isAutoplay || false
            });
            // console.log(`💾 [Log] Đã lưu bài: ${track.info.title}`);
        } catch (err) {
            console.error('❌ Lỗi khi lưu MusicLog:', err);
        }
    });

    // --- SỰ KIỆN KHI HẾT NHẠC TRONG HÀNG CHỜ (QUEUE END) ---
    poru.on('queueEnd', async (player) => {
        const channel = client.channels.cache.get(player.textChannel);

        // A. Xử lý chế độ 24/7 (Radio Mode)
        if (player.isAutoplay) {
            // 1. Lấy bài ngẫu nhiên từ DB RadioSong
            const songData = await getRandomTrack();

            if (!songData) {
                if (channel) channel.send('⚠️ Kho nhạc Radio đang trống! Admin hãy dùng `/radio-add` để thêm nhạc.');
                player.isAutoplay = false; // Tắt chế độ 24/7
                player.destroy();
                return;
            }

            // 2. Tìm bài hát đó qua Lavalink
            const res = await poru.resolve({ query: songData.url, source: 'ytsearch', requester: client.user });

            if (res.loadType !== 'LOAD_FAILED' && res.loadType !== 'NO_MATCHES') {
                const track = res.tracks[0];
                track.info.requester = client.user; // Bot tự yêu cầu

                // 3. Thêm vào hàng chờ và phát ngay
                player.queue.add(track);
                player.play();
                if (channel) channel.send(`📻 **Radio 24/7:** Bot tự động phát bài ngẫu nhiên: **${songData.title}**`);
                return; // QUAN TRỌNG: Return để không chạy lệnh destroy bên dưới
            }
        }

        // B. Nếu không phải chế độ 24/7 -> Hết nhạc -> Nghỉ ngơi
        if (channel) channel.send('👋 Hết nhạc rồi, bot đi ngủ đây!');

        // Xóa sạch hàng chờ rác trong DB (nếu còn sót)
        await GuildMusicQueue.deleteOne({ guildId: player.guildId }).catch(() => { });

        player.destroy();
    });
}