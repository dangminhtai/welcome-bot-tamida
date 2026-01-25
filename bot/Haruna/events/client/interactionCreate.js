import { Events, MessageFlags } from "discord.js";
import { decorateTree, createGameUI, checkGameFinished } from '../../utils/christmasGameUtils.js';
import { TREE_CONFIG } from '../../config/christmasTreeConfig.js';
import { getConfig } from '../../utils/childConfigUtils.js';

// Music Panel Imports
import PanelState from '../../models/PanelState.js';
import { renderMusicPanel } from '../../utils/PanelRenderer.js';
import { poru } from '../../utils/LavalinkManager.js';
import { applyAudioSettings } from '../../utils/AudioController.js';
import GuildMusicQueue from '../../models/GuildMusicQueue.js';
import UserPlaylist from '../../models/UserPlaylist.js';
import RadioSong from '../../models/RadioSong.js';
import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';

export default (client) => {
    client.on(Events.InteractionCreate, async interaction => {
        // --- 0. CHECK ENVIRONMENT LOCK (STOP DEPLOY) ---
        // Nếu đang ở Linux (Deploy) và có cờ chặn -> return ngay để bot Local (Windows) xử lý
        if (process.platform === 'linux') {
            const stopDeploy = await getConfig('stop_deploy');
            if (stopDeploy) return;
        }

        // --- 0.1 XỬ LÝ MUSIC PANEL (BẤT TỬ) ---
        if ((interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) && interaction.customId?.startsWith('music_')) {
            try {
                const customId = interaction.customId;

                // 1. XỬ LÝ MODAL (Không cần load State cũ, chỉ cần xử lý input)
                if (interaction.isModalSubmit()) {
                    const guildId = interaction.guild.id;
                    await interaction.deferReply({ ephemeral: true });

                    if (customId === 'music_modal_pl_create') {
                        const name = interaction.fields.getTextInputValue('pl_name_input');
                        await UserPlaylist.create({ userId: interaction.user.id, name: name, tracks: [] });
                        await interaction.editReply({ content: `✅ Đã tạo playlist **${name}**!` });

                        // Refresh UI nếu đang ở tab playlist (cần tìm lại state)
                        const state = await PanelState.findOne({ messageId: interaction.message.id });
                        if (state) {
                            const newPayload = await renderMusicPanel(guildId, state, interaction.user.id);
                            await interaction.message.edit(newPayload);
                        }
                    }
                    else if (customId === 'music_modal_queue_add') {
                        const query = interaction.fields.getTextInputValue('q_url_input');
                        // Lấy player
                        let player = poru.players.get(guildId);
                        if (!player) {
                            const voice = interaction.member.voice.channel;
                            if (voice) {
                                player = poru.createConnection({ guildId: guildId, voiceChannel: voice.id, textChannel: interaction.channel.id, deaf: false });
                                await applyAudioSettings(player);
                            }
                        }

                        if (!player) return interaction.editReply('❌ Bạn chưa vào voice!');

                        // Check Priority Flag (được truyền qua cache hoặc query customId nếu có, nhưng modal submit chỉ có ID modal)
                        // Do modal ID cố định, ta cần cách khác hoặc chấp nhận logic đơn giản.
                        // Ở đây ta dùng 1 modal ID chung, ta sẽ check lại logic gọi modal ở dưới.
                        // À chờ chút, ở PanelRenderer ta gọi modal với ID cố định.
                        // Để phân biệt priority, ta có thể không cần phân biệt ở modal ID mà xử lý ở bước gọi modal (nhưng modal submit tách rời).
                        // Mẹo: Dùng cache tạm hoặc check lại button click.
                        // Đơn giản nhất: Ta không phân biệt Priority ở đây được trừ khi update ID modal luc show.
                        // FIX: Update PanelRenderer để set ID modal khác nhau: music_modal_queue_add_priority
                    }
                    return;
                }

                // 2. XỬ LÝ BUTTON & MENU
                // Load State từ DB
                let state = await PanelState.findOne({ messageId: interaction.message.id });
                if (!state) {
                    return interaction.reply({ content: '❌ Panel này đã quá cũ hoặc lỗi DB. Hãy tạo mới bằng `/music-panel`', ephemeral: true });
                }

                if (customId === 'music_nav_close') {
                    await interaction.message.delete().catch(() => { });
                    await PanelState.deleteOne({ messageId: interaction.message.id });
                    return;
                }

                // Modal Triggers (Cần show form ngay, không deferUpdate)
                if (customId === 'music_pl_create') {
                    const modal = new ModalBuilder().setCustomId('music_modal_pl_create').setTitle('Tạo Playlist Mới');
                    const nameInput = new TextInputBuilder().setCustomId('pl_name_input').setLabel("Tên Playlist").setStyle(TextInputStyle.Short);
                    modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
                    return interaction.showModal(modal);
                }
                if (customId === 'music_queue_add' || customId === 'music_queue_add_priority') {
                    const isPriority = customId === 'music_queue_add_priority';
                    const modal = new ModalBuilder().setCustomId(isPriority ? 'music_modal_queue_add_priority' : 'music_modal_queue_add').setTitle(isPriority ? 'Hát Ngay' : 'Thêm Nhạc');
                    const urlInput = new TextInputBuilder().setCustomId('q_url_input').setLabel("Link / Tên bài hát").setStyle(TextInputStyle.Short);
                    modal.addComponents(new ActionRowBuilder().addComponents(urlInput));
                    return interaction.showModal(modal);
                }

                // Các nút khác -> Defer Update
                await interaction.deferUpdate();
                const player = poru.players.get(interaction.guild.id);

                // --- LOGIC XỬ LÝ (cập nhật state hoặc player) ---

                // NAV
                if (customId.startsWith('music_nav_')) {
                    state.currentTab = customId.replace('music_nav_', '');
                }

                // CONTROLS (Home)
                if (player && state.currentTab === 'home') {
                    if (customId === 'music_btn_pause') player.pause(!player.isPaused);
                    if (customId === 'music_btn_skip') player.skip();
                    if (customId === 'music_btn_stop') { player.destroy(); state.currentTab = 'home'; }
                    if (customId === 'music_btn_loop') player.setLoop(player.loop === 'NONE' ? 'TRACK' : (player.loop === 'TRACK' ? 'QUEUE' : 'NONE'));
                    if (customId === 'music_btn_shuffle') {
                        if (player.queue.length > 0) {
                            for (let k = player.queue.length - 1; k > 0; k--) {
                                const j = Math.floor(Math.random() * (k + 1));
                                [player.queue[k], player.queue[j]] = [player.queue[j], player.queue[k]];
                            }
                        }
                    }
                }

                // SETTINGS
                if (state.currentTab === 'settings') {
                    let setting = await MusicSetting.findOne({ guildId: interaction.guild.id });
                    if (!setting) setting = await MusicSetting.create({ guildId: interaction.guild.id });

                    if (customId === 'music_set_vol_up') setting.volume = Math.min(setting.volume + 10, 150);
                    if (customId === 'music_set_vol_down') setting.volume = Math.max(setting.volume - 10, 0);
                    if (customId === 'music_set_speed_up') setting.speed = parseFloat((setting.speed + 0.1).toFixed(1));
                    if (customId === 'music_set_speed_down') setting.speed = Math.max(parseFloat((setting.speed - 0.1).toFixed(1)), 0.5);
                    if (customId === 'music_set_nightcore') {
                        setting.nightcore = !setting.nightcore;
                        if (setting.nightcore) { setting.speed = 1.2; setting.pitch = 1.2; } else { setting.speed = 1.0; setting.pitch = 1.0; }
                    }
                    if (customId === 'music_set_bass') setting.bassboost = !setting.bassboost;
                    if (customId === 'music_set_reset') { setting.volume = 100; setting.speed = 1.0; setting.pitch = 1.0; setting.nightcore = false; setting.bassboost = false; }

                    await setting.save();
                    if (player) await applyAudioSettings(player);
                }

                // RADIO
                if (state.currentTab === 'radio') {
                    if (customId === 'music_radio_next') state.radioPage++;
                    if (customId === 'music_radio_prev') state.radioPage = Math.max(1, state.radioPage - 1);
                    if (customId === 'music_radio_toggle') {
                        if (player) {
                            player.isAutoplay = !player.isAutoplay;
                            if (player.isAutoplay && !player.currentTrack && player.queue.length === 0) poru.emit('queueEnd', player);
                        }
                    }
                    if (customId === 'music_radio_add_current' && player?.currentTrack) {
                        await RadioSong.create({ url: player.currentTrack.info.uri, title: player.currentTrack.info.title, addedBy: interaction.user.tag });
                        await interaction.followUp({ content: '✅ Đã thêm vào Radio!', ephemeral: true });
                    }
                }

                // QUEUE
                if (state.currentTab === 'queue') {
                    if (customId === 'music_queue_next') state.queuePage++;
                    if (customId === 'music_queue_prev') state.queuePage = Math.max(1, state.queuePage - 1);
                    if (customId === 'music_queue_clear' && player) player.queue.clear();
                    if (customId === 'music_queue_shuffle' && player) {
                        // Shuffle logic duplicate but simple enough to repeat
                        for (let k = player.queue.length - 1; k > 0; k--) {
                            const j = Math.floor(Math.random() * (k + 1));
                            [player.queue[k], player.queue[j]] = [player.queue[j], player.queue[k]];
                        }
                    }
                }

                // PLAYLIST
                if (state.currentTab === 'playlist') {
                    if (customId === 'music_pl_select') state.selectedPlaylistId = interaction.values[0];
                    if (customId === 'music_pl_delete' && state.selectedPlaylistId) {
                        await UserPlaylist.findByIdAndDelete(state.selectedPlaylistId);
                        state.selectedPlaylistId = null;
                    }
                    if (customId === 'music_pl_add_current' && state.selectedPlaylistId && player?.currentTrack) {
                        const pl = await UserPlaylist.findById(state.selectedPlaylistId);
                        if (pl) {
                            pl.tracks.push({ title: player.currentTrack.info.title, url: player.currentTrack.info.uri, author: player.currentTrack.info.author, duration: player.currentTrack.info.length });
                            await pl.save();
                            await interaction.followUp({ content: `✅ Đã thêm vào **${pl.name}**!`, ephemeral: true });
                        }
                    }
                    if (customId === 'music_pl_play' && state.selectedPlaylistId) {
                        const pl = await UserPlaylist.findById(state.selectedPlaylistId);
                        if (pl && pl.tracks.length > 0) {
                            let targetPlayer = player;
                            if (!targetPlayer) {
                                const voice = interaction.member.voice.channel;
                                if (voice) {
                                    targetPlayer = poru.createConnection({ guildId: interaction.guild.id, voiceChannel: voice.id, textChannel: interaction.channel.id, deaf: false });
                                    await applyAudioSettings(targetPlayer);
                                }
                            }
                            if (targetPlayer) {
                                targetPlayer.queue.clear();
                                targetPlayer.stop();
                                const tracksToAdd = [];
                                for (const t of pl.tracks) {
                                    const res = await poru.resolve({ query: t.url, source: 'ytsearch', requester: interaction.user });
                                    if (res.tracks.length > 0) {
                                        targetPlayer.queue.add(res.tracks[0]);
                                        tracksToAdd.push({ title: t.title, url: t.url, author: t.author, duration: t.duration, requester: interaction.user.tag, addedAt: new Date() });
                                    }
                                }
                                targetPlayer.play();

                                // Sync DB
                                await GuildMusicQueue.updateOne(
                                    { guildId: interaction.guild.id },
                                    { $set: { tracks: tracksToAdd, updatedAt: new Date() } },
                                    { upsert: true }
                                );
                            }
                        }
                    }
                }

                // 3. Update State & UI
                await state.save();
                const newPayload = await renderMusicPanel(interaction.guild.id, state, interaction.user.id);
                try { await interaction.editReply(newPayload); } catch (e) { }

            } catch (err) {
                console.error("Music Panel Error:", err);
            }
            return; // Stop processing other events
        }

        // --- 0.2 XỬ LÝ MODAL (TIẾP TỤC LOGIC RIÊNG BIỆT CHO QUEUE ADD) ---
        if (interaction.isModalSubmit() && (interaction.customId === 'music_modal_queue_add' || interaction.customId === 'music_modal_queue_add_priority')) {
            const guildId = interaction.guild.id;
            const query = interaction.fields.getTextInputValue('q_url_input');
            const isPriority = interaction.customId === 'music_modal_queue_add_priority';

            // Defer trước
            if (!interaction.deferred) await interaction.deferReply({ ephemeral: true });

            let player = poru.players.get(guildId);
            if (!player) {
                const voice = interaction.member.voice.channel;
                if (!voice) return interaction.editReply('❌ Bạn chưa vào voice!');
                player = poru.createConnection({ guildId: guildId, voiceChannel: voice.id, textChannel: interaction.channel.id, deaf: false });
                await applyAudioSettings(player);
            }

            const tracksToAdd = [];
            let replyMsg = '';

            const res = await poru.resolve({ query: query, source: 'ytsearch', requester: interaction.user });

            if (isPriority) {
                if (res.loadType === 'TRACK_LOADED' || res.loadType === 'SEARCH_RESULT') {
                    const track = res.tracks[0];
                    track.info.requester = interaction.user;
                    player.queue.unshift(track);
                    tracksToAdd.push({ title: track.info.title, url: track.info.uri, author: track.info.author, duration: track.info.length, requester: interaction.user.tag, addedAt: new Date() });
                    if (!player.isPlaying && !player.isPaused) player.play(); else player.skip();
                    replyMsg = `🚀 **[ƯU TIÊN]** Đã thêm **${track.info.title}**!`;
                } else {
                    replyMsg = '❌ Không tìm thấy bài hát!';
                }
            } else {
                if (res.loadType === 'PLAYLIST_LOADED') {
                    for (const track of res.tracks) {
                        track.info.requester = interaction.user;
                        player.queue.add(track);
                        tracksToAdd.push({ title: track.info.title, url: track.info.uri, author: track.info.author, duration: track.info.length, requester: interaction.user.tag, addedAt: new Date() });
                    }
                    if (!player.isPlaying && !player.isPaused) player.play();
                    replyMsg = `✅ Đã thêm playlist **${res.playlistInfo.name}**!`;
                } else if (res.loadType === 'TRACK_LOADED' || res.loadType === 'SEARCH_RESULT') {
                    const track = res.tracks[0];
                    track.info.requester = interaction.user;
                    player.queue.add(track);
                    tracksToAdd.push({ title: track.info.title, url: track.info.uri, author: track.info.author, duration: track.info.length, requester: interaction.user.tag, addedAt: new Date() });
                    if (!player.isPlaying && !player.isPaused) player.play();
                    replyMsg = `✅ Đã thêm **${track.info.title}**!`;
                } else {
                    replyMsg = '❌ Không tìm thấy bài hát!';
                }
            }

            // Sync DB
            if (tracksToAdd.length > 0) {
                const updateQuery = isPriority
                    ? { $push: { tracks: { $each: tracksToAdd, $position: 0 } } }
                    : { $push: { tracks: { $each: tracksToAdd } } };
                await GuildMusicQueue.updateOne({ guildId: guildId }, { ...updateQuery, $set: { updatedAt: new Date() } }, { upsert: true });
            }

            await interaction.editReply(replyMsg);

            // Re-render
            const state = await PanelState.findOne({ messageId: interaction.message?.id }); // Modal submit might not have message ref if ephemeral? actually interaction.message usually exists for modal from button
            if (state) {
                const newPayload = await renderMusicPanel(guildId, state, interaction.user.id);
                // Cần tìm tin nhắn gốc để edit. 
                // Interaction.message có thể undefined với modal? 
                // Với button-triggered modal, interaction.message là message chứa button.
                try { await interaction.message.edit(newPayload); } catch (e) { }
            }
            return;
        }


        // --- 1. XỬ LÝ GAME CÂY THÔNG (BUTTON & MENU) ---
        if (interaction.customId?.startsWith('tree_') && (interaction.isButton() || interaction.isStringSelectMenu())) {
            try {
                // Defer update ngay lập tức
                await interaction.deferUpdate();

                // Load DB
                const { default: ChristmasTree } = await import('../../models/ChristmasTree.js');
                const game = await ChristmasTree.findOne({ messageId: interaction.message.id });

                if (!game || game.isFinished) {
                    return interaction.followUp({ content: TREE_CONFIG.messages.gameEnded, flags: MessageFlags.Ephemeral });
                }

                // --- STOP GAME LOGIC ---
                if (interaction.customId === TREE_CONFIG.buttons.customIds.stop) {
                    if (!game.stopRequesterId) {
                        // Request Stop
                        game.stopRequesterId = interaction.user.id;
                    } else if (game.stopRequesterId === interaction.user.id) {
                        // Cancel Request (Click again/Cancel button)
                        game.stopRequesterId = null;
                        await interaction.followUp({ content: TREE_CONFIG.messages.stopCancelled, flags: MessageFlags.Ephemeral });
                    }
                    await game.save();

                    const hostName = interaction.message.embeds[0]?.footer?.text?.split('Host: ')[1] || "Unknown";
                    const hostAvatar = interaction.message.embeds[0]?.footer?.iconURL;
                    const uiPayload = createGameUI(game, hostName, hostAvatar);
                    await interaction.editReply(uiPayload);
                    return;
                }

                if (interaction.customId === TREE_CONFIG.buttons.customIds.approve_stop) {
                    if (game.stopRequesterId === interaction.user.id) {
                        return interaction.followUp({ content: TREE_CONFIG.messages.selfApprove, flags: MessageFlags.Ephemeral });
                    }
                    // Approved by another person
                    game.isFinished = true;
                    // Logic tính điểm đã có sẵn ở dưới, nhưng cần xử lý kết thúc ngay
                    await game.save();

                    // Re-render UI as Finished
                    const hostName = interaction.message.embeds[0]?.footer?.text?.split('Host: ')[1] || "Unknown";
                    const hostAvatar = interaction.message.embeds[0]?.footer?.iconURL;
                    const uiPayload = createGameUI(game, hostName, hostAvatar);
                    await interaction.editReply(uiPayload);
                    return;
                }

                // --- DECORATE LOGIC ---
                // Xử lý Logic Game
                let itemKey = 'candy'; // Mặc định
                let specificPos = null;

                if (interaction.isButton()) {
                    if (interaction.customId.includes('candy')) itemKey = 'candy';
                    if (interaction.customId.includes('bow')) itemKey = 'bow';
                    if (interaction.customId.includes('gift')) itemKey = 'gift';
                    if (interaction.customId.includes('heart')) itemKey = 'heart';
                }
                else if (interaction.isStringSelectMenu()) {
                    specificPos = interaction.values[0].replace('pos_', '');
                    itemKey = 'gift'; // Chọn vị trí thì cho quà xịn
                }

                const result = decorateTree(game.treeState, itemKey, specificPos);

                if (!result.success) {
                    return interaction.followUp({ content: TREE_CONFIG.messages.fullTree, flags: MessageFlags.Ephemeral });
                }

                // Update Data
                game.treeState = result.newTree;
                const uid = interaction.user.id;
                const currentScore = game.scores.get(uid) || 0;
                game.scores.set(uid, currentScore + result.score);
                game.names.set(uid, interaction.user.globalName || interaction.user.username);

                // Check endgame
                if (checkGameFinished(game.treeState)) {
                    game.isFinished = true;
                }

                await game.save();

                // Update UI
                const hostName = interaction.message.embeds[0]?.footer?.text?.split('Host: ')[1] || "Unknown";
                const hostAvatar = interaction.message.embeds[0]?.footer?.iconURL;

                const uiPayload = createGameUI(game, hostName, hostAvatar);
                await interaction.editReply(uiPayload);

                // TB: Nếu game vừa kết thúc -> Tag tất cả mọi người
                if (game.isFinished) {
                    const playerMentions = Array.from(game.names.keys()).map(id => `<@${id}>`).join(' ');
                    await interaction.followUp({
                        content: `${TREE_CONFIG.messages.gameEnded}\n${playerMentions}`,
                    });
                }

            } catch (err) {
                console.error("Tree Game Error:", err);
                if (!interaction.replied) {
                    await interaction.followUp({ content: TREE_CONFIG.messages.error, flags: MessageFlags.Ephemeral });
                }
            }
            return;
        }

        // --- 2. XỬ LÝ LỆNH SLASH ---
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) {
                try {
                    await interaction.reply({ content: 'Lệnh không tìm thấy.', flags: MessageFlags.Ephemeral });
                } catch (_) { }
                return;
            }

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error("Command Execution Error:", error);
                try {
                    if (interaction.deferred) {
                        await interaction.editReply({ content: 'Có lỗi xảy ra khi thực hiện lệnh này!' }).catch(() => { });
                    } else if (!interaction.replied) {
                        await interaction.reply({ content: 'Có lỗi xảy ra khi thực hiện lệnh này!', flags: MessageFlags.Ephemeral }).catch(() => { });
                    }
                } catch (_) { }
            }
        }
    });
}