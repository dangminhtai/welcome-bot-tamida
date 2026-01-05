//commands/slash/christmas-tree.js
const { SlashCommandBuilder } = require('discord.js');
const { createGameUI } = require('../../utils/christmasGameUtils.js');
const { TREE_CONFIG } = require('../../config/christmasTreeConfig.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName(TREE_CONFIG.command.name)
        .setDescription(TREE_CONFIG.command.description)
        .setIntegrationTypes([0, 1]) // GuildInstall, UserInstall
        .setContexts([0, 1, 2]) // Guild, BotDM, PrivateChannel
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
            // Because this was using dynamic import for models/ChristmasTree.js, and that file likely is CommonJS or needs to be loaded.
            // If the project is CommonJS, we can just require it.
            const ChristmasTree = require('../../models/ChristmasTree.js');
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