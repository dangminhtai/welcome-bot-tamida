//events/client/interactionCreate.js
import { Events, MessageFlags } from "discord.js";
import { decorateTree, createGameUI, checkGameFinished } from '../../utils/christmasGameUtils.js';
import { TREE_CONFIG } from '../../config/christmasTreeConfig.js';

export default (client) => {
    client.on(Events.InteractionCreate, async interaction => {

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
            if (!command) return;

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error("Command Execution Error:", error);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: 'Có lỗi xảy ra khi thực hiện lệnh này!', flags: MessageFlags.Ephemeral });
                } else {
                    await interaction.followUp({ content: 'Có lỗi xảy ra khi thực hiện lệnh này!', flags: MessageFlags.Ephemeral });
                }
            }
        }
    });
}