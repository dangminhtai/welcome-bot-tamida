//commands/slash/christmas-tree.js
import { SlashCommandBuilder, ApplicationIntegrationType, InteractionContextType } from 'discord.js';
import { createGameUI } from '../../utils/christmasGameUtils.js';
import { TREE_CONFIG } from '../../config/christmasTreeConfig.js';

export default {
    data: new SlashCommandBuilder()
        .setName(TREE_CONFIG.command.name)
        .setDescription(TREE_CONFIG.command.description)
        .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
        .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
        .addStringOption(option =>
            option.setName('size')
                .setDescription(TREE_CONFIG.command.options.size.description)
                .setRequired(true)
                .addChoices(
                    { name: 'Cây Thông Lớn', value: 'huge' },
                    { name: 'Cây Thông Vừa', value: 'medium' },
                )),

    async execute(interaction) {
        const size = interaction.options.getString('size');
        const baseTree = TREE_CONFIG.templates[size] || TREE_CONFIG.templates.medium;

        const initialState = {
            treeState: baseTree,
            scores: new Map(),
            names: new Map(),
            isFinished: false
        };

        // Tạo UI
        const uiPayload = createGameUI(initialState, interaction.user.username, interaction.user.displayAvatarURL());

        const response = await interaction.reply({
            ...uiPayload,
            fetchReply: true
        });

        // Lưu DB
        try {
            const { default: ChristmasTree } = await import('../../models/ChristmasTree.js');
            await ChristmasTree.create({
                messageId: response.id,
                channelId: interaction.channelId,
                treeState: baseTree,
                scores: {},
                names: {}
            });
        } catch (error) {
            console.error("DB Error:", error);
        }
    },
};