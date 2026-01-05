const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const CompletedBot = require('../../models/CompletedBot');
const QueueBot = require('../../models/QueueBot');

function getCharacterImage(botName) {
    const slug = botName.toLowerCase().replace(/\s+/g, '_');
    return `https://images.genshin-builds.com/genshin/characters/${slug}/image.png`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('queue-bot')
        .setDescription('Manage the bot release queue')
        .addSubcommand(sub =>
            sub
                .setName('add')
                .setDescription('Add a bot to the release queue')
                .addStringOption(opt =>
                    opt.setName('botname')
                        .setDescription('The name of the bot')
                        .setRequired(true))
                .addUserOption(opt =>
                    opt.setName('requestedby')
                        .setDescription('Who requested this bot (@username)')
                        .setRequired(true))
        )
        .addSubcommand(sub =>
            sub
                .setName('show')
                .setDescription('Show the current bot release queue')
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        if (sub === 'add') {
            const botName = interaction.options.getString('botname').trim();
            const requestedByUser = interaction.options.getUser('requestedby');

            const alreadyCompleted = await CompletedBot.findOne({ name: new RegExp(`^${botName}$`, 'i') });
            if (alreadyCompleted) {
                return interaction.reply({
                    content: `⚠️ The bot **${botName}** is already completed.`,
                    ephemeral: true
                });
            }

            const alreadyQueued = await QueueBot.findOne({ name: new RegExp(`^${botName}$`, 'i') });
            if (alreadyQueued) {
                return interaction.reply({
                    content: `⚠️ The bot **${botName}** is already in the queue.`,
                    ephemeral: true
                });
            }

            if (!requestedByUser) {
                return interaction.reply({
                    content: `⚠️ Invalid user mention.`,
                    ephemeral: true
                });
            }

            const newQueueBot = new QueueBot({
                name: botName,
                requestedBy: requestedByUser.tag,
                requestedById: requestedByUser.id
            });
            await newQueueBot.save();

            await interaction.reply({
                content: `✅ Added **${botName}** (requested by ${requestedByUser}) to the queue.`,
                ephemeral: false
            });
        }

        else if (sub === 'show') {
            const queue = await QueueBot.find().sort({ addedAt: 1 });
            if (!queue.length) {
                return interaction.reply({
                    content: "📋 Bot Release Queue\n\n*(empty)*",
                    ephemeral: false
                });
            }

            // Mỗi bot = 1 embed
            const embeds = queue.slice(0, 10).map((bot, i) => {
                return new EmbedBuilder()
                    .setTitle(`${i + 1}. ${bot.name}`)
                    .setDescription(`Requested by <@${bot.requestedById}>`)
                    .setColor(0x00AE86)
                    .setThumbnail(getCharacterImage(bot.name))
                    .setFooter({ text: "✅ Completed bots will be marked and moved to the archive." });
            });

            await interaction.reply({ embeds, ephemeral: false });
        }
    },
};
