// commands/admin/monitor.js
const { SlashCommandBuilder } = require('discord.js');
const MonitorSettings = require('../../models/MonitorSettings');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('monitor')
        .setDescription('Quản lý hệ thống giám sát bot')
        .addSubcommand(sub =>
            sub.setName('toggle')
                .setDescription('Bật / tắt thông báo monitor')
                .addBooleanOption(opt =>
                    opt.setName('enabled')
                        .setDescription('true = bật, false = tắt')
                        .setRequired(true)
                )
        ),

    async execute(interaction) {
        const enabled = interaction.options.getBoolean('enabled');

        await MonitorSettings.updateOne(
            { adminId: interaction.user.id },
            { $set: { notificationsEnabled: enabled } },
            { upsert: true }
        );

        await interaction.reply({
            content: enabled
                ? '✅ Đã bật thông báo giám sát bot.'
                : '❌ Đã tắt thông báo giám sát bot.',
            ephemeral: true
        });
    }
};
