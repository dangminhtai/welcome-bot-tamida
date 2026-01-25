import {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ComponentType,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} from 'discord.js';
import { poru } from '../../utils/LavalinkManager.js';
import { applyAudioSettings } from '../../utils/AudioController.js';
import MusicSetting from '../../models/MusicSetting.js';
import RadioSong from '../../models/RadioSong.js';
import UserPlaylist from '../../models/UserPlaylist.js';
import GuildMusicQueue from '../../models/GuildMusicQueue.js';

// --- HÀM HELPER ---
function createProgressBar(current, total, size = 15) {
    if (!total || total === 0) return '🔴 LIVE STREAM';
    const progress = Math.round((size * current) / total);
    const emptyProgress = size - progress;
    return '▬'.repeat(progress) + '🔘' + '▬'.repeat(emptyProgress);
}

function formatTime(ms) {
    if (!ms) return '00:00';
    return new Date(ms).toISOString().slice(14, 19);
}

// Helper để chèn nhạc ưu tiên (dùng cho Playlist & Radio)
async function insertPriorityTrack(player, trackData, user) {
    const res = await poru.resolve({ query: trackData.url, source: 'ytsearch', requester: user });
    if (res.loadType === 'TRACK_LOADED' || res.loadType === 'SEARCH_RESULT') {
        const track = res.tracks[0];
        track.info.requester = user;
        player.queue.unshift(track); // Chèn đầu
        return true;
    }
    return false;
}

export default {
    data: new SlashCommandBuilder()
        .setName('music-panel')
        .setDescription('Mở bảng điều khiển âm nhạc tất-cả-trong-một (All-in-One)'),

    async execute(interaction) {
        await interaction.deferReply();
        const guildId = interaction.guild.id;
        let currentRadioPage = 1; // Biến lưu trang hiện tại của Radio
        let currentQueuePage = 1; // Biến lưu trang hiện tại của Queue
        let selectedPlaylistId = null; // Biến lưu Playlist đang chọn

        // --- HÀM RENDER GIAO DIỆN ---
        const renderPanel = async (tab = 'home') => {
            const player = poru.players.get(guildId);
            const currentTrack = player?.currentTrack;
            const embed = new EmbedBuilder().setTimestamp();
            const components = [];

            // ==================== TAB: HOME ====================
            if (tab === 'home') {
                if (player && currentTrack) {
                    embed.setColor('#0099ff')
                        .setTitle('💿 TRÌNH PHÁT NHẠC')
                        .setDescription(`**[${currentTrack.info.title}](${currentTrack.info.uri})**`)
                        .setThumbnail(currentTrack.info.artworkUrl || currentTrack.info.image)
                        .addFields(
                            { name: 'Ca sĩ', value: currentTrack.info.author, inline: true },
                            { name: 'Người yêu cầu', value: currentTrack.info.requester?.tag || 'System', inline: true },
                            {
                                name: `Thời gian (${formatTime(player.position)} / ${formatTime(currentTrack.info.length)})`,
                                value: createProgressBar(player.position, currentTrack.info.length),
                                inline: false
                            },
                            {
                                name: 'Trạng thái',
                                value: `Vol: **${player.volume}%** | Loop: **${player.loop}** | 24/7: **${player.isAutoplay ? 'BẬT' : 'TẮT'}**`,
                                inline: false
                            }
                        );

                    // Nút điều khiển Home
                    const rowControls = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('btn_pause').setEmoji(player.isPaused ? '▶️' : 'II').setStyle(player.isPaused ? ButtonStyle.Success : ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('btn_skip').setEmoji('⏭️').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('btn_loop').setEmoji(player.loop === 'NONE' ? '🔁' : '🔂').setStyle(player.loop === 'NONE' ? ButtonStyle.Secondary : ButtonStyle.Success),
                        new ButtonBuilder().setCustomId('btn_shuffle').setEmoji('🔀').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('btn_stop').setEmoji('⏹️').setStyle(ButtonStyle.Danger)
                    );
                    components.push(rowControls);
                } else {
                    embed.setColor('#808080')
                        .setTitle('💤 BOT ĐANG NGHỈ NGƠI')
                        .setDescription('Hiện không có nhạc.\nDùng các Tab bên dưới để bật nhạc hoặc dùng lệnh `/play`.');
                }
            }

            // ==================== TAB: SETTINGS ====================
            else if (tab === 'settings') {
                // Lấy setting từ DB
                let setting = await MusicSetting.findOne({ guildId: guildId });
                if (!setting) setting = await MusicSetting.create({ guildId: guildId });

                embed.setColor('#9900ff')
                    .setTitle('🎛️ CÀI ĐẶT ÂM THANH')
                    .setDescription('Điều chỉnh hiệu ứng. Cài đặt sẽ được **LƯU** vĩnh viễn.')
                    .addFields(
                        { name: '🔊 Volume', value: `${setting.volume}%`, inline: true },
                        { name: '⏩ Speed', value: `${setting.speed.toFixed(1)}x`, inline: true },
                        { name: '🐿️ Nightcore', value: setting.nightcore ? '✅ Bật' : '❌ Tắt', inline: true },
                        { name: '🥁 Bassboost', value: setting.bassboost ? '✅ Bật' : '❌ Tắt', inline: true }
                    );

                const rowVol = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('set_vol_down').setLabel('Vol -10').setStyle(ButtonStyle.Secondary).setEmoji('🔉'),
                    new ButtonBuilder().setCustomId('set_vol_up').setLabel('Vol +10').setStyle(ButtonStyle.Secondary).setEmoji('🔊'),
                    new ButtonBuilder().setCustomId('set_reset').setLabel('Reset All').setStyle(ButtonStyle.Danger).setEmoji('🧹')
                );

                const rowEffect = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('set_speed_down').setLabel('Speed -').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('set_speed_up').setLabel('Speed +').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('set_nightcore').setLabel('Nightcore').setStyle(setting.nightcore ? ButtonStyle.Success : ButtonStyle.Secondary).setEmoji('🐿️'),
                    new ButtonBuilder().setCustomId('set_bass').setLabel('Bassboost').setStyle(setting.bassboost ? ButtonStyle.Success : ButtonStyle.Secondary).setEmoji('🥁')
                );
                components.push(rowVol, rowEffect);
            }

            // ==================== TAB: RADIO ====================
            else if (tab === 'radio') {
                const itemsPerPage = 5;
                const totalSongs = await RadioSong.countDocuments();
                const totalPages = Math.ceil(totalSongs / itemsPerPage) || 1;

                // Đảm bảo page hợp lệ
                if (currentRadioPage < 1) currentRadioPage = 1;
                if (currentRadioPage > totalPages) currentRadioPage = totalPages;

                const songs = await RadioSong.find()
                    .skip((currentRadioPage - 1) * itemsPerPage)
                    .limit(itemsPerPage);

                const listString = songs.length > 0
                    ? songs.map((s, i) => `**${(currentRadioPage - 1) * itemsPerPage + i + 1}.** [${s.title}](${s.url})`).join('\n')
                    : '*(Kho nhạc trống)*';

                embed.setColor('#00ff00')
                    .setTitle(`📻 QUẢN LÝ RADIO 24/7 (Tổng: ${totalSongs})`)
                    .setDescription(`**Trạng thái 24/7:** ${player?.isAutoplay ? '✅ Đang chạy' : '❌ Đang tắt'}\n\n${listString}`)
                    .setFooter({ text: `Trang ${currentRadioPage}/${totalPages}` });

                const rowRadioControls = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('radio_toggle').setLabel(player?.isAutoplay ? 'Tắt 24/7' : 'Bật 24/7').setStyle(player?.isAutoplay ? ButtonStyle.Danger : ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('radio_add_current').setLabel('Thêm bài đang phát').setStyle(ButtonStyle.Primary).setDisabled(!player?.currentTrack),
                    new ButtonBuilder().setCustomId('radio_prev').setEmoji('⬅️').setStyle(ButtonStyle.Secondary).setDisabled(currentRadioPage === 1),
                    new ButtonBuilder().setCustomId('radio_next').setEmoji('➡️').setStyle(ButtonStyle.Secondary).setDisabled(currentRadioPage === totalPages)
                );
                components.push(rowRadioControls);
            }

            // ==================== TAB: PLAYLIST ====================
            else if (tab === 'playlist') {
                const userPlaylists = await UserPlaylist.find({ userId: interaction.user.id });

                embed.setColor('#ffaa00').setTitle('💾 PLAYLIST CỦA BẠN');

                if (userPlaylists.length === 0) {
                    embed.setDescription('Bạn chưa có playlist nào. Bấm **Tạo Mới** để bắt đầu.');
                    const rowCreate = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('pl_create').setLabel('✨ Tạo Playlist Mới').setStyle(ButtonStyle.Success)
                    );
                    components.push(rowCreate);
                } else {
                    // Menu chọn Playlist
                    const options = userPlaylists.map(pl => ({ label: pl.name, value: pl._id.toString(), description: `${pl.tracks.length} bài hát` }));
                    const rowSelect = new ActionRowBuilder().addComponents(
                        new StringSelectMenuBuilder().setCustomId('pl_select').setPlaceholder('Chọn Playlist của bạn').addOptions(options)
                    );
                    components.push(rowSelect);

                    // Nếu đã chọn 1 playlist -> Hiện chi tiết & Nút bấm
                    if (selectedPlaylistId) {
                        const selectedPl = userPlaylists.find(pl => pl._id.toString() === selectedPlaylistId);
                        if (selectedPl) {
                            const trackList = selectedPl.tracks.slice(0, 5).map((t, i) => `${i + 1}. ${t.title}`).join('\n');
                            embed.setDescription(`**Đang chọn: ${selectedPl.name}**\n${trackList}\n...(và ${selectedPl.tracks.length - 5} bài khác)`);

                            const rowPlActions = new ActionRowBuilder().addComponents(
                                new ButtonBuilder().setCustomId('pl_play').setLabel('▶️ Phát').setStyle(ButtonStyle.Success),
                                new ButtonBuilder().setCustomId('pl_add_current').setLabel('➕ Thêm bài này').setStyle(ButtonStyle.Secondary).setDisabled(!player?.currentTrack),
                                new ButtonBuilder().setCustomId('pl_delete').setLabel('🗑️ Xóa PL').setStyle(ButtonStyle.Danger)
                            );
                            components.push(rowPlActions);
                        }
                    } else {
                        embed.setDescription('Hãy chọn một playlist từ menu bên dưới.');
                    }
                    // Vẫn hiện nút tạo mới ở dưới cùng
                    components.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('pl_create').setLabel('✨ Tạo Mới').setStyle(ButtonStyle.Secondary)));
                }
            }

            // ==================== TAB: QUEUE (HÀNG CHỜ) ====================
            else if (tab === 'queue') {
                const queue = player?.queue || [];
                const itemsPerPage = 10;
                const totalPages = Math.ceil(queue.length / itemsPerPage) || 1;

                if (currentQueuePage < 1) currentQueuePage = 1;
                if (currentQueuePage > totalPages) currentQueuePage = totalPages;

                const queueSlice = queue.slice((currentQueuePage - 1) * itemsPerPage, currentQueuePage * itemsPerPage);

                const listString = queueSlice.length > 0
                    ? queueSlice.map((t, i) => `**${(currentQueuePage - 1) * itemsPerPage + i + 1}.** [${t.info.title.substring(0, 50)}](${t.info.uri}) \`[${formatTime(t.info.length)}]\` - <@${t.info.requester?.id || 'System'}>`).join('\n')
                    : '*(Hàng chờ trống)*';

                embed.setColor('#FFA500') // Màu cam
                    .setTitle(`📜 HÀNG CHỜ NHẠC (${queue.length} bài)`)
                    .setDescription(`**Đang phát:** [${player?.currentTrack?.info.title}](${player?.currentTrack?.info.uri}) \n\n${listString}`)
                    .setFooter({ text: `Trang ${currentQueuePage}/${totalPages} | Tổng thời lượng: ${formatTime(queue.reduce((acc, t) => acc + t.info.length, 0))}` });

                const rowQueue = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('queue_prev').setEmoji('⬅️').setStyle(ButtonStyle.Secondary).setDisabled(currentQueuePage === 1),
                    new ButtonBuilder().setCustomId('queue_next').setEmoji('➡️').setStyle(ButtonStyle.Secondary).setDisabled(currentQueuePage === totalPages),
                    new ButtonBuilder().setCustomId('queue_shuffle').setLabel('Trộn').setStyle(ButtonStyle.Secondary).setEmoji('�').setDisabled(queue.length < 2),
                    new ButtonBuilder().setCustomId('queue_clear').setLabel('Xóa').setStyle(ButtonStyle.Danger).setEmoji('�').setDisabled(queue.length === 0)
                );
                const rowQueue2 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('queue_add').setLabel('Thêm Nhạc').setStyle(ButtonStyle.Success).setEmoji('➕'),
                    new ButtonBuilder().setCustomId('queue_add_priority').setLabel('Hát Ngay').setStyle(ButtonStyle.Primary).setEmoji('🚀')
                );
                components.push(rowQueue, rowQueue2);
            }

            // ==================== THANH ĐIỀU HƯỚNG (NAV) ====================
            const rowNav = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('nav_home').setLabel('Home').setEmoji('🏠').setStyle(tab === 'home' ? ButtonStyle.Primary : ButtonStyle.Secondary).setDisabled(tab === 'home'),
                new ButtonBuilder().setCustomId('nav_queue').setLabel('Queue').setEmoji('📜').setStyle(tab === 'queue' ? ButtonStyle.Primary : ButtonStyle.Secondary).setDisabled(tab === 'queue'),
                new ButtonBuilder().setCustomId('nav_radio').setLabel('Radio').setEmoji('📻').setStyle(tab === 'radio' ? ButtonStyle.Primary : ButtonStyle.Secondary).setDisabled(tab === 'radio'),
                new ButtonBuilder().setCustomId('nav_playlist').setLabel('Playlist').setEmoji('💾').setStyle(tab === 'playlist' ? ButtonStyle.Primary : ButtonStyle.Secondary).setDisabled(tab === 'playlist'),
                new ButtonBuilder().setCustomId('nav_settings').setLabel('Settings').setEmoji('🎛️').setStyle(tab === 'settings' ? ButtonStyle.Primary : ButtonStyle.Secondary).setDisabled(tab === 'settings'),
                new ButtonBuilder().setCustomId('nav_close').setLabel('Đóng').setEmoji('🗑️').setStyle(ButtonStyle.Danger)
            );
            components.push(rowNav);

            return { embeds: [embed], components: components };
        };

        // Gửi Panel
        let currentTab = 'home';
        const msg = await interaction.editReply(await renderPanel(currentTab));

        // --- COLLECTOR XỬ LÝ SỰ KIỆN ---
        const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button | ComponentType.StringSelectMenu, time: 600000 }); // 10 phút

        collector.on('collect', async (i) => {
            const player = poru.players.get(guildId);

            // 1. NAVIGATION
            if (i.customId.startsWith('nav_')) {
                if (i.customId === 'nav_close') return i.message.delete().catch(() => { });
                currentTab = i.customId.replace('nav_', '');
                await i.update(await renderPanel(currentTab));
                return;
            }

            // 2. XỬ LÝ HOME
            if (currentTab === 'home' && player) {
                switch (i.customId) {
                    case 'btn_pause': player.pause(!player.isPaused); break;
                    case 'btn_skip': player.skip(); break;
                    case 'btn_stop': player.destroy(); currentTab = 'home'; break;
                    case 'btn_loop': player.setLoop(player.loop === 'NONE' ? 'TRACK' : (player.loop === 'TRACK' ? 'QUEUE' : 'NONE')); break;
                    case 'btn_shuffle':
                        if (player.queue.length > 0) {
                            for (let k = player.queue.length - 1; k > 0; k--) {
                                const j = Math.floor(Math.random() * (k + 1));
                                [player.queue[k], player.queue[j]] = [player.queue[j], player.queue[k]];
                            }
                        }
                        break;
                }
                try { collector.resetTimer(); await i.update(await renderPanel('home')); } catch (e) { }
            }

            // 3. XỬ LÝ SETTINGS
            if (currentTab === 'settings') {
                let setting = await MusicSetting.findOne({ guildId: guildId });
                if (!setting) setting = await MusicSetting.create({ guildId: guildId });
                let changed = false;

                switch (i.customId) {
                    case 'set_vol_up': setting.volume = Math.min(setting.volume + 10, 150); changed = true; break;
                    case 'set_vol_down': setting.volume = Math.max(setting.volume - 10, 0); changed = true; break;
                    case 'set_speed_up': setting.speed = parseFloat((setting.speed + 0.1).toFixed(1)); changed = true; break;
                    case 'set_speed_down': setting.speed = Math.max(parseFloat((setting.speed - 0.1).toFixed(1)), 0.5); changed = true; break;
                    case 'set_nightcore':
                        setting.nightcore = !setting.nightcore;
                        if (setting.nightcore) { setting.speed = 1.2; setting.pitch = 1.2; } else { setting.speed = 1.0; setting.pitch = 1.0; }
                        changed = true; break;
                    case 'set_bass': setting.bassboost = !setting.bassboost; changed = true; break;
                    case 'set_reset': setting.volume = 100; setting.speed = 1.0; setting.pitch = 1.0; setting.nightcore = false; setting.bassboost = false; changed = true; break;
                }

                if (changed) {
                    await setting.save();
                    if (player) await applyAudioSettings(player); // Apply ngay lập tức
                    try { collector.resetTimer(); await i.update(await renderPanel('settings')); } catch (e) { }
                }
            }

            // 4. XỬ LÝ RADIO
            if (currentTab === 'radio') {
                if (i.customId === 'radio_next') { currentRadioPage++; await i.update(await renderPanel('radio')); }
                else if (i.customId === 'radio_prev') { currentRadioPage--; await i.update(await renderPanel('radio')); }
                else if (i.customId === 'radio_toggle') {
                    if (!player) return i.reply({ content: '❌ Bot chưa vào voice!', ephemeral: true });
                    player.isAutoplay = !player.isAutoplay;
                    // Nếu bật 24/7 mà bot đang rảnh thì kích hoạt ngay
                    if (player.isAutoplay && !player.currentTrack && player.queue.length === 0) {
                        poru.emit('queueEnd', player); // Giả lập sự kiện hết nhạc để trigger 24/7
                    }
                    await i.update(await renderPanel('radio'));
                }
                else if (i.customId === 'radio_add_current') {
                    if (player?.currentTrack) {
                        const track = player.currentTrack;
                        await RadioSong.create({
                            url: track.info.uri, title: track.info.title, addedBy: i.user.tag
                        });
                        await i.reply({ content: `✅ Đã thêm **${track.info.title}** vào Radio!`, ephemeral: true });
                    }
                }
            }

            // 5. XỬ LÝ PLAYLIST
            if (currentTab === 'playlist') {
                if (i.customId === 'pl_select') {
                    selectedPlaylistId = i.values[0];
                    await i.update(await renderPanel('playlist'));
                }
                else if (i.customId === 'pl_create') {
                    const modal = new ModalBuilder().setCustomId('modal_pl_create').setTitle('Tạo Playlist Mới');
                    const nameInput = new TextInputBuilder().setCustomId('pl_name_input').setLabel("Tên Playlist").setStyle(TextInputStyle.Short);
                    modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
                    await i.showModal(modal);

                    const submitted = await i.awaitModalSubmit({
                        filter: (m) => m.customId === 'modal_pl_create' && m.user.id === i.user.id,
                        time: 60000
                    }).catch(() => null);

                    if (submitted) {
                        const name = submitted.fields.getTextInputValue('pl_name_input');
                        await UserPlaylist.create({ userId: submitted.user.id, name: name, tracks: [] });
                        await submitted.reply({ content: `✅ Đã tạo playlist **${name}**!`, ephemeral: true });
                        try { await msg.edit(await renderPanel('playlist')); } catch (e) { }
                    }
                }
                else if (i.customId === 'pl_delete') {
                    if (selectedPlaylistId) {
                        await UserPlaylist.findByIdAndDelete(selectedPlaylistId);
                        selectedPlaylistId = null;
                        await i.update(await renderPanel('playlist'));
                    }
                }
                else if (i.customId === 'pl_add_current') {
                    if (selectedPlaylistId && player?.currentTrack) {
                        const pl = await UserPlaylist.findById(selectedPlaylistId);
                        if (pl) {
                            pl.tracks.push({
                                title: player.currentTrack.info.title,
                                url: player.currentTrack.info.uri,
                                author: player.currentTrack.info.author,
                                duration: player.currentTrack.info.length
                            });
                            await pl.save();
                            await i.reply({ content: `✅ Đã thêm vào playlist **${pl.name}**!`, ephemeral: true });
                        }
                    }
                }
                else if (i.customId === 'pl_play') {
                    if (selectedPlaylistId) {
                        const pl = await UserPlaylist.findById(selectedPlaylistId);
                        if (pl && pl.tracks.length > 0) {
                            // Logic phát Playlist: Xóa queue cũ -> Add playlist mới
                            if (!player) {
                                // Nếu chưa có player thì tạo mới (cần check voice)
                                const voice = interaction.member.voice.channel;
                                if (!voice) return i.reply({ content: 'Vào voice đi!', ephemeral: true });
                                const newPlayer = poru.createConnection({ guildId: guildId, voiceChannel: voice.id, textChannel: interaction.channel.id, deaf: false });
                                await applyAudioSettings(newPlayer);

                                for (const t of pl.tracks) {
                                    const res = await poru.resolve({ query: t.url, source: 'ytsearch', requester: i.user });
                                    if (res.tracks.length > 0) newPlayer.queue.add(res.tracks[0]);
                                }
                                newPlayer.play();
                            } else {
                                player.queue.clear();
                                player.stop(); // Stop bài hiện tại
                                for (const t of pl.tracks) {
                                    const res = await poru.resolve({ query: t.url, source: 'ytsearch', requester: i.user });
                                    if (res.tracks.length > 0) player.queue.add(res.tracks[0]);
                                }
                                player.play();
                            }
                            await i.reply({ content: `▶️ Đang phát playlist **${pl.name}**!`, ephemeral: true });
                        } else {
                            await i.reply({ content: '❌ Playlist trống hoặc không tồn tại.', ephemeral: true });
                        }
                    }
                }
            }

            // 6. XỬ LÝ QUEUE
            if (currentTab === 'queue') {
                if (i.customId === 'queue_prev') { currentQueuePage--; await i.update(await renderPanel('queue')); }
                else if (i.customId === 'queue_next') { currentQueuePage++; await i.update(await renderPanel('queue')); }
                else if (i.customId === 'queue_clear') {
                    if (player) {
                        player.queue.clear();
                        await i.update(await renderPanel('queue'));
                    }
                }
                else if (i.customId === 'queue_shuffle') {
                    if (player && player.queue.length > 0) {
                        // Thuật toán Fisher-Yates shuffle
                        for (let k = player.queue.length - 1; k > 0; k--) {
                            const j = Math.floor(Math.random() * (k + 1));
                            [player.queue[k], player.queue[j]] = [player.queue[j], player.queue[k]];
                        }
                        await i.update(await renderPanel('queue'));
                    }
                }
                else if (i.customId === 'queue_add' || i.customId === 'queue_add_priority') {
                    const isPriority = i.customId === 'queue_add_priority';
                    const modal = new ModalBuilder().setCustomId('modal_queue_add').setTitle(isPriority ? 'Hát Ngay (Chèn Đầu)' : 'Thêm nhạc vào Queue');
                    const urlInput = new TextInputBuilder().setCustomId('q_url_input').setLabel("Tên bài hát / Link URL").setStyle(TextInputStyle.Short);
                    modal.addComponents(new ActionRowBuilder().addComponents(urlInput));
                    await i.showModal(modal);

                    const submitted = await i.awaitModalSubmit({
                        filter: (m) => m.customId === 'modal_queue_add' && m.user.id === i.user.id,
                        time: 60000
                    }).catch(() => null);

                    if (submitted) {
                        const query = submitted.fields.getTextInputValue('q_url_input');
                        let player = poru.players.get(guildId);

                        // Nếu chưa có player thì tạo (nếu user đang trong voice)
                        if (!player) {
                            const voice = submitted.member.voice.channel;
                            if (!voice) return submitted.reply({ content: '❌ Bạn chưa vào voice!', ephemeral: true });
                            player = poru.createConnection({ guildId: guildId, voiceChannel: voice.id, textChannel: submitted.channel.id, deaf: false });
                            await applyAudioSettings(player);
                        }

                        // Nếu là Priority (Hát Ngay)
                        if (i.customId === 'queue_add_priority') {
                            const success = await insertPriorityTrack(player, { url: query }, submitted.user);
                            if (success) {
                                if (!player.isPlaying && !player.isPaused) player.play();
                                await submitted.reply({ content: `🚀 Đã chèn **${query}** vào đầu hàng chờ!`, ephemeral: true });
                            } else {
                                await submitted.reply({ content: '❌ Không tìm thấy bài hát!', ephemeral: true });
                            }
                        }
                        // Nếu là Thêm thường (Queue Add)
                        else {
                            const res = await poru.resolve({ query: query, source: 'ytsearch', requester: submitted.user });
                            if (res.loadType === 'LOAD_FAILED' || res.loadType === 'NO_MATCHES') {
                                await submitted.reply({ content: '❌ Không tìm thấy bài hát!', ephemeral: true });
                            } else if (res.loadType === 'PLAYLIST_LOADED') {
                                for (const track of res.tracks) {
                                    player.queue.add(track);
                                }
                                if (!player.isPlaying && !player.isPaused) player.play();
                                await submitted.reply({ content: `✅ Đã thêm playlist **${res.playlistInfo.name}** (${res.tracks.length} bài) vào hàng chờ!`, ephemeral: true });
                            } else {
                                const track = res.tracks[0];
                                player.queue.add(track);
                                if (!player.isPlaying && !player.isPaused) player.play();
                                await submitted.reply({ content: `✅ Đã thêm **${track.info.title}** vào hàng chờ!`, ephemeral: true });
                            }
                        }

                        // Refresh panel nếu đang ở Queue tab
                        try { await msg.edit(await renderPanel('queue')); } catch (e) { }
                    }
                }
            }
        });

        /*
            if (!modalInteraction.isModalSubmit()) return;
            if (modalInteraction.customId === 'modal_pl_create') {
                const name = modalInteraction.fields.getTextInputValue('pl_name_input');
                await UserPlaylist.create({ userId: modalInteraction.user.id, name: name, tracks: [] });
                await modalInteraction.reply({ content: `✅ Đã tạo playlist **${name}**!`, ephemeral: true });
                // Refresh panel
                try { await msg.edit(await renderPanel('playlist')); } catch (e) { }
            }
            if (modalInteraction.customId === 'modal_queue_add') {
                const query = modalInteraction.fields.getTextInputValue('q_url_input');
                let player = poru.players.get(guildId);

                // Nếu chưa có player thì tạo (nếu user đang trong voice)
                if (!player) {
                    const voice = modalInteraction.member.voice.channel;
                    if (!voice) return modalInteraction.reply({ content: '❌ Bạn chưa vào voice!', ephemeral: true });
                    player = poru.createConnection({ guildId: guildId, voiceChannel: voice.id, textChannel: modalInteraction.channel.id, deaf: false });
                    await applyAudioSettings(player);
                }

                const res = await poru.resolve({ query: query, source: 'ytsearch', requester: modalInteraction.user });
                if (res.loadType === 'LOAD_FAILED' || res.loadType === 'NO_MATCHES') {
                    return modalInteraction.reply({ content: '❌ Không tìm thấy bài hát!', ephemeral: true });
                }

                if (res.loadType === 'PLAYLIST_LOADED') {
                    for (const track of res.tracks) {
                        player.queue.add(track);
                    }
                    if (!player.isPlaying && !player.isPaused) player.play();
                    await modalInteraction.reply({ content: `✅ Đã thêm playlist **${res.playlistInfo.name}** (${res.tracks.length} bài) vào hàng chờ!`, ephemeral: true });
                } else {
                    const track = res.tracks[0];
                    player.queue.add(track);
                    if (!player.isPlaying && !player.isPaused) player.play();
                    await modalInteraction.reply({ content: `✅ Đã thêm **${track.info.title}** vào hàng chờ!`, ephemeral: true });
                }

                // Refresh panel nếu đang ở Queue tab
                try { await msg.edit(await renderPanel('queue')); } catch (e) { }
            }
        */

        collector.on('end', () => {
            interaction.editReply({ components: [] }).catch(() => { });
        });
    },
};