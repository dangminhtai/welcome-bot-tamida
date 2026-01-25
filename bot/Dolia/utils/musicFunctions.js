import { poru } from '../utils/LavalinkManager.js';
import MusicSetting from '../models/MusicSetting.js';
import RadioSong from '../models/RadioSong.js';
import PanelState from '../models/PanelState.js';
import { applyAudioSettings } from '../utils/AudioController.js';
import { renderMusicPanel } from '../utils/PanelRenderer.js';
import { EmbedBuilder } from 'discord.js';

/**
 * 1. Play Music
 */
export async function play_music({ guild, channel, user, query, priority }) {
    if (!channel) return "❌ Bạn chưa tham gia kênh thoại nào.";

    // Connect to voice
    const player = poru.createConnection({
        guildId: guild.id,
        voiceChannel: channel.id,
        textChannel: channel.id,
        deaf: true,
    });

    const res = await poru.resolve({ query, source: 'ytsearch', requester: user });

    if (res.loadType === 'LOAD_FAILED') {
        return "❌ Lỗi khi tải nhạc.";
    } else if (res.loadType === 'NO_MATCHES') {
        return "❌ Không tìm thấy bài hát nào.";
    }

    // Handle Tracks
    let addedTrack = null;
    if (res.loadType === 'PLAYLIST_LOADED') {
        for (const track of res.tracks) {
            track.info.requester = user;
            player.queue.add(track);
        }
        addedTrack = `Playlist: ${res.playlistInfo.name} (${res.tracks.length} bài)`;
    } else {
        const track = res.tracks[0];
        track.info.requester = user;
        if (priority) {
            player.queue.unshift(track);
            addedTrack = `[Priority] ${track.info.title}`;
        } else {
            player.queue.add(track);
            addedTrack = track.info.title;
        }
    }

    if (!player.isPlaying && !player.isPaused) {
        player.play();
    }

    return `🎶 Đã thêm vào hàng chờ: **${addedTrack}**`;
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
export async function adjust_audio_settings({ guild, settings }) {
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
        if (settings.nightcore !== undefined) dbSetting.nightcore = settings.nightcore;
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
        if (res.loadType !== 'TRACK_LOADED' && res.loadType !== 'SEARCH_RESULT') return "❌ Link không hợp lệ.";

        const track = res.tracks[0];
        await RadioSong.create({
            url: track.info.uri,
            title: track.info.title,
            addedBy: user.username
        });
        return `✅ Đã thêm vài Radio: **${track.info.title}**`;
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
