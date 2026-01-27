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

// Hàm hỗ trợ: Lấy kênh tin nhắn an toàn (Cache -> Fetch)
async function getSafeChannel(channelId) {
    if (!channelId) return null;
    try {
        // 1. Tìm trong cache trước (nhanh)
        let channel = client.channels.cache.get(channelId);
        // 2. Nếu không thấy, dùng fetch để lấy từ API Discord (chậm hơn xíu nhưng chắc chắn)
        if (!channel) {
            channel = await client.channels.fetch(channelId).catch(() => null);
        }
        return channel;
    } catch (e) {
        console.error(`❌ Không tìm thấy channel ${channelId}:`, e.message);
        return null;
    }
}

// Hàm hỗ trợ: Lấy 1 bài hát ngẫu nhiên từ kho nhạc Radio
async function getRandomTrack() {
    try {
        const randomSong = await RadioSong.aggregate([{ $sample: { size: 1 } }]);
        return randomSong.length > 0 ? randomSong[0] : null;
    } catch (e) {
        console.error("Lỗi lấy nhạc Random:", e);
        return null;
    }
}

export function initLavalink(discordClient) {
    client = discordClient;

    poru = new Poru(client, nodes, {
        library: 'discord.js',
        defaultPlatform: 'ytsearch',
        reconnectTries: Infinity,
    });

    poru.init(client);

    poru.on('nodeConnect', node => console.log(`✅ [Lavalink] Node ${node.name} đã kết nối!`));
    poru.on('nodeDisconnect', node => console.log(`❌ [Lavalink] Mất kết nối Node: ${node.name}`));
    poru.on('nodeError', (node, error) => console.log(`⚠️ [Lavalink] Node ${node.name} lỗi: ${error.message}`));

    // --- SỰ KIỆN TRACK START (BẮT ĐẦU PHÁT) ---
    poru.on('trackStart', async (player, track) => {
        // FIX: Dùng hàm getSafeChannel để đảm bảo lấy được kênh
        const channel = await getSafeChannel(player.textChannel);

        if (channel) {
            const duration = track.info.length;
            const timeString = track.info.isStream ? "🔴 LIVE" : new Date(duration).toISOString().slice(14, 19);
            const requester = track.info.requester?.tag || client.user.tag;

            // Gửi tin nhắn (Catch lỗi nếu bot thiếu quyền gửi tin)
            channel.send(`🎶 Đang phát: **${track.info.title}** \`[${timeString}]\`\n👤 Yêu cầu bởi: **${requester}**`).catch(e => console.error("Không gửi được tin nhắn trackStart:", e.message));
        }

        // Đồng bộ Queue DB
        try {
            await GuildMusicQueue.updateOne(
                { guildId: player.guildId },
                { $pop: { tracks: -1 } }
            );
        } catch (e) { }

        // Ghi Log
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
        } catch (err) { console.error('Lỗi log nhạc:', err.message); }
    });

    // --- SỰ KIỆN TRACK ERROR (NHẠC LỖI) ---
    // Cái này cực quan trọng: Nếu bài hát lỗi, nó sẽ không crash mà tự gọi queueEnd hoặc skip
    // --- SỰ KIỆN TRACK ERROR (NHẠC LỖI) ---
    poru.on('trackError', async (player, track, error) => {
        console.error(`⚠️ Track Lỗi [${track.info.title}]:`, error);

        // Gửi thông báo lỗi cho người dùng
        const channel = await getSafeChannel(player.textChannel);
        if (channel) {
            channel.send(`⚠️ Lỗi tải bài hát **${track.info.title}**. Đang tự động bỏ qua...`).catch(() => { });
        }

        // Tự động skip sang bài khác (nếu còn) hoặc queueEnd sẽ tự chạy
        if (player.queue.size > 0) {
            player.stop();
        } else {
            // Nếu không còn nhạc, event queueEnd sẽ lo. 
            // Nhưng để chắc ăn, gọi stop() để kích hoạt dòng chảy sự kiện.
            player.stop();
        }
    });

    poru.on('trackStuck', async (player, track, threshold) => {
        console.warn(`⚠️ Track bị kẹt [${track.info.title}] quá ${threshold}ms -> Đang Auto Skip...`);

        const channel = await getSafeChannel(player.textChannel);
        if (channel) {
            channel.send(`⚠️ Bài hát **${track.info.title}** bị kẹt (mạng lag or YouTube chặn). Bot tự động chuyển bài tiếp theo!`).catch(() => { });
        }

        // Bắt buộc dừng player để kích hoạt sự kiện tiếp theo
        // Sử dụng try-catch để tránh crash nếu player đã bị destroy
        try {
            player.stop();
        } catch (err) {
            console.error("Lỗi khi cố stop track bị kẹt:", err);
            // Nếu stop lỗi (vd player chết), thử destroy luôn để reset
            player.destroy();
        }
    });

    // --- SỰ KIỆN QUEUE END (HẾT NHẠC) ---
    poru.on('queueEnd', async (player) => {
        const channel = await getSafeChannel(player.textChannel);

        // 1. Kiểm tra chế độ 24/7
        if (player.isAutoplay) {
            // Lấy nhạc từ DB
            const songData = await getRandomTrack();

            if (!songData) {
                if (channel) channel.send('⚠️ Kho nhạc Radio đang trống! Tắt chế độ 24/7.');
                player.isAutoplay = false;
                player.destroy();
                return;
            }

            // Resolve nhạc
            const res = await poru.resolve({ query: songData.url, source: 'ytsearch', requester: client.user });

            if (res.loadType !== 'LOAD_FAILED' && res.loadType !== 'NO_MATCHES') {
                const track = res.tracks[0];
                track.info.requester = client.user;

                player.queue.add(track);
                player.play();

                if (channel) channel.send(`📻 **Radio 24/7:** Tự động phát: **${songData.title}**`).catch(() => { });
                return; // QUAN TRỌNG: Return để không chạy code bên dưới
            } else {
                // Nếu bài lấy từ DB bị lỗi link -> Thử lấy bài khác ngay lập tức (Đệ quy nhẹ)
                console.log("Bài Radio bị lỗi, đang thử bài khác...");
                // poru.emit('queueEnd', player); // Gọi lại sự kiện này để thử lại (Cẩn thận loop vô tận, nên thôi)
            }
        }

        // 2. Nếu thực sự hết nhạc và không cứu được
        if (channel) channel.send('👋 Hết nhạc rồi, bot đi ngủ đây!').catch(() => { });

        await GuildMusicQueue.deleteOne({ guildId: player.guildId }).catch(() => { });
        player.destroy();
    });
}