import { poru } from '../utils/LavalinkManager.js';
import MusicSetting from '../models/MusicSetting.js';
import RadioSong from '../models/RadioSong.js';
import PanelState from '../models/PanelState.js';
import GuildMusicQueue from '../models/GuildMusicQueue.js'; // Added missing import
import { applyAudioSettings } from '../utils/AudioController.js';
import { renderMusicPanel } from '../utils/PanelRenderer.js';
import { ChannelType } from 'discord.js'; // Added ChannelType

/**
 * 1. Play Music
 */
export async function play_music({ guild, channel, user, query, priority }) {
    // --- LOGIC CHỌN KÊNH VOICE THÔNG MINH (MATCH SLASH COMMAND) ---
    // channel: Kênh text nơi lệnh được gọi (context.channel) - SAI, ở đây thường là TextChannel
    // user: User object
    // Cần tìm Voice Channel của User
    const member = guild.members.cache.get(user.id);
    let voiceChannel = member?.voice?.channel;

    const player = poru.players.get(guild.id);

    // Trường hợp 1: Người dùng KHÔNG ở trong voice
    if (!voiceChannel) {
        if (player && player.isConnected) {
            // Nếu Bot đang hát ở đâu đó -> Dùng luôn kênh đó (Điều khiển từ xa)
            voiceChannel = guild.channels.cache.get(player.voiceChannel);
        } else {
            // Nếu Bot chưa hát -> Tự động tìm kênh Voice đầu tiên của Server để chui vào
            voiceChannel = guild.channels.cache
                .filter(c => c.type === ChannelType.GuildVoice && c.joinable && !c.full)
                .first();
        }
    }

    if (!voiceChannel) {
        return "❌ Bot không tìm thấy kênh Voice nào để vào cả! Bạn hãy vào một kênh Voice trước.";
    }

    // Connect to voice
    const connection = poru.createConnection({
        guildId: guild.id,
        voiceChannel: voiceChannel.id,
        textChannel: channel.id,
        deaf: true,
    });

    // Apply settings only if new connection or just to be safe
    if (!player) await applyAudioSettings(connection);

    // Resolve Track
    const isUrl = /^https?:\/\//.test(query);
    const res = await poru.resolve({ query, source: isUrl ? null : 'ytsearch', requester: user });

    if (res.loadType === 'LOAD_FAILED') {
        return "❌ Lỗi khi tải nhạc (Load Failed).";
    } else if (res.loadType === 'NO_MATCHES') {
        return "❌ Không tìm thấy bài hát nào.";
    }

    // Handle Tracks & DB
    const currentPlayer = poru.players.get(guild.id); // Get active player
    let addedMsg = "";
    const tracksToAdd = [];

    // Helper format DB
    const formatTrackForDB = (track) => ({
        title: track.info.title,
        url: track.info.uri,
        author: track.info.author,
        duration: track.info.length,
        requester: user.tag, // or username
        addedAt: new Date()
    });

    if (res.loadType === 'PLAYLIST_LOADED') {
        for (const track of res.tracks) {
            track.info.requester = user;
            tracksToAdd.push(formatTrackForDB(track));
        }

        if (priority) {
            for (let i = res.tracks.length - 1; i >= 0; i--) {
                currentPlayer.queue.unshift(res.tracks[i]);
            }
            addedMsg = `⚡ **[ƯU TIÊN]** Đã chèn Playlist **${res.playlistInfo.name}** lên đầu!`;
        } else {
            currentPlayer.queue.add(res.tracks);
            addedMsg = `Playlist: ${res.playlistInfo.name} (${res.tracks.length} bài)`;
        }
    } else {
        const track = res.tracks[0];
        track.info.requester = user;
        tracksToAdd.push(formatTrackForDB(track));

        if (priority) {
            currentPlayer.queue.unshift(track);
            addedMsg = `⚡ **[ƯU TIÊN]** Đã chèn **${track.info.title}** lên đầu!`;
        } else {
            currentPlayer.queue.add(track);
            addedMsg = track.info.title;
        }
    }

    // --- DB SYNC ---
    const updateQuery = priority
        ? { $push: { tracks: { $each: tracksToAdd, $position: 0 } } }
        : { $push: { tracks: { $each: tracksToAdd } } };

    await GuildMusicQueue.updateOne(
        { guildId: guild.id },
        { ...updateQuery, $set: { updatedAt: new Date() } },
        { upsert: true }
    ).catch(e => console.error('Lỗi lưu Queue DB:', e));


    // Play Trigger
    if (priority) {
        if (currentPlayer.isPlaying || currentPlayer.isPaused) currentPlayer.skip();
        else currentPlayer.play();
    } else {
        if (!currentPlayer.isPlaying && !currentPlayer.isPaused) {
            currentPlayer.play();
        }
    }

    return `🎶 Đã thêm vào hàng chờ: **${addedMsg}** Tại kênh: ${voiceChannel.name}`;
}

/**
 * 2. Control Playback
 */
export async function control_playback({ guild, action }) {
    const player = poru.players.get(guild.id);
    if (!player) return "❌ Bot chưa phát nhạc.";

    switch (action) {
        case 'skip':
            player.stop();
            return "⏭️ Đã bỏ qua bài hát.";
        case 'stop':
            player.destroy();
            // Clear DB Queue? Optional, usually we keep history or clear it.
            // But let's verify PlaySlash logic. It usually just destroys.
            return "🛑 Đã dừng nhạc và rời kênh.";
        case 'pause':
            player.pause(true);
            return "⏸️ Đã tạm dừng.";
        case 'resume':
            player.pause(false);
            return "▶️ Đã tiếp tục phát.";
        default:
            return "❌ Hành động không hợp lệ.";
    }
}

/**
 * 3. Audio Settings
 */
export async function adjust_audio_settings({ guild, ...settings }) {
    const player = poru.players.get(guild.id);

    // Find or create setting
    let dbSetting = await MusicSetting.findOne({ guildId: guild.id });
    if (!dbSetting) dbSetting = await MusicSetting.create({ guildId: guild.id });

    if (settings.reset) {
        dbSetting.volume = 100;
        dbSetting.speed = 1.0;
        dbSetting.pitch = 1.0;
        dbSetting.nightcore = false;
        dbSetting.bassboost = false;
    } else {
        if (settings.volume !== undefined) dbSetting.volume = settings.volume;
        if (settings.speed !== undefined) dbSetting.speed = settings.speed;
        if (settings.pitch !== undefined) dbSetting.pitch = settings.pitch;
        if (settings.nightcore !== undefined) {
            dbSetting.nightcore = settings.nightcore;
            // Sync logic from slash command usually relates nightcore to speed/pitch
            if (dbSetting.nightcore) {
                dbSetting.speed = 1.2;
                dbSetting.pitch = 1.2;
            } else {
                dbSetting.speed = 1.0;
                dbSetting.pitch = 1.0;
            }
        }
        if (settings.bassboost !== undefined) dbSetting.bassboost = settings.bassboost;
    }

    await dbSetting.save();

    // Apply if player exists
    if (player) {
        await applyAudioSettings(player);
        return `✅ Đã cập nhật cài đặt âm thanh! (Volume: ${dbSetting.volume}, Nightcore: ${dbSetting.nightcore ? 'On' : 'Off'})`;
    }

    return `✅ Đã lưu cài đặt (Bot sẽ áp dụng khi phát nhạc).`;
}

/**
 * 4. Manage Radio
 */
export async function manage_radio({ guild, user, action, query, index }) {
    if (action === 'add') {
        if (!query) return "❌ Vui lòng nhập link bài hát.";

        // Check URL validity using Poru
        const res = await poru.resolve({ query, source: 'ytsearch', requester: user });
        if (res.loadType !== 'TRACK_LOADED' && res.loadType !== 'SEARCH_RESULT' && res.loadType !== 'PLAYLIST_LOADED') return "❌ Link không hợp lệ.";

        let title = "Unknown";
        let url = query;
        if (res.tracks.length > 0) {
            title = res.tracks[0].info.title;
            url = res.tracks[0].info.uri;
        }

        await RadioSong.create({
            url: url,
            title: title,
            addedBy: user.username
        });
        return `✅ Đã thêm vào Radio: **${title}**`;
    }

    else if (action === 'remove') {
        const songs = await RadioSong.find().sort({ addedAt: 1 });
        if (!index || index < 1 || index > songs.length) return "❌ Số thứ tự không hợp lệ.";

        const songToRemove = songs[index - 1];
        await RadioSong.findByIdAndDelete(songToRemove._id);
        return `🗑️ Đã xóa khỏi Radio: **${songToRemove.title}**`;
    }

    return "❌ Hành động sai.";
}

/**
 * 5. Show Music Panel
 */
export async function show_music_panel({ guild, channel, user }) {
    // Clear old panel state
    await PanelState.deleteMany({ channelId: channel.id });

    const initialState = {
        currentTab: 'home',
        radioPage: 1,
        queuePage: 1,
        selectedPlaylistId: null
    };

    const payload = await renderMusicPanel(guild.id, initialState, user.id);
    const message = await channel.send(payload);

    await PanelState.create({
        guildId: guild.id,
        channelId: channel.id,
        messageId: message.id,
        ...initialState
    });

    return "✅ Đã mở bảng điều khiển nhạc!";
}
