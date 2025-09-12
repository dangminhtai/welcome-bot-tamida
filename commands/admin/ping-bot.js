// commands/admin/ping-bot.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const MonitoredBot = require('../../models/MonitoredBot');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping-bot')
        .setDescription('Kiểm tra trạng thái các bot trong database (dựa vào WebSocket presence khi có guild chung)'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true }).catch(() => { });

        try {
            const client = interaction.client;
            const bots = await MonitoredBot.find({ isActive: true });

            if (!bots.length) {
                return interaction.editReply({ content: '⚠️ Chưa có bot nào được cấu hình trong database.' }).catch(() => { });
            }

            // Helper: tìm presence bằng cách dò qua các guild của client
            async function getPresenceFromMutualGuilds(userId) {
                // duyệt qua guilds (stop khi tìm thấy member đầu tiên)
                for (const [guildId, guild] of client.guilds.cache) {
                    try {
                        // cố fetch member; nếu bot không phải member thì trả null
                        const member = await guild.members.fetch(userId).catch(() => null);
                        if (member) {
                            // presence có thể undefined nếu intent chưa bật, nhưng thường có khi guilds và intents đúng
                            const status = member.presence?.status || 'offline';
                            return { found: true, guildId, status };
                        }
                    } catch (e) {
                        // skip lỗi guild cụ thể (không crash toàn bộ)
                        continue;
                    }
                }
                // không tìm thấy ở bất kỳ guild chung nào
                return { found: false, status: 'offline' };
            }

            // Kiểm tra tất cả bot (song song)
            const checks = bots.map(async bot => {
                try {
                    const res = await getPresenceFromMutualGuilds(bot.botId);
                    if (res.found) {
                        const status = res.status;
                        const emoji = status === 'online' ? '✅' : (status === 'idle' || status === 'dnd' ? '⚠️' : '❌');

                        // cập nhật DB (tuỳ anh có muốn)
                        bot.lastStatus = status;
                        await bot.save().catch(() => { });

                        return {
                            name: `${emoji} ${bot.name}`,
                            value: `**Status:** ${status}\n**Mutual guild:** ${res.guildId}`,
                            status
                        };
                    } else {
                        bot.lastStatus = 'offline';
                        await bot.save().catch(() => { });
                        return { name: `❌ ${bot.name}`, value: `**Status:** offline (no mutual guild)`, status: 'offline' };
                    }
                } catch (err) {
                    console.error(`Error checking bot ${bot.name}:`, err);
                    bot.lastStatus = 'error';
                    await bot.save().catch(() => { });
                    return { name: `⚠️ ${bot.name}`, value: '**Không thể kiểm tra**', status: 'error' };
                }
            });

            const results = await Promise.allSettled(checks)
                .then(arr => arr.map(r => r.status === 'fulfilled' ? r.value : { name: '⚠️ Lỗi', value: 'Không thể kiểm tra', status: 'error' }));

            const onlineCount = results.filter(r => r.status === 'online').length;
            const idleCount = results.filter(r => r.status === 'idle' || r.status === 'dnd').length;
            const offlineCount = results.filter(r => r.status === 'offline').length;

            const embed = new EmbedBuilder()
                .setTitle('⚡ Bot Status Monitor (presence via mutual guilds)')
                .setDescription(`Kiểm tra ${bots.length} bot`)
                .addFields(
                    { name: '📊 Summary', value: `Online: **${onlineCount}**\nIdle/DND: **${idleCount}**\nOffline: **${offlineCount}**` },
                    ...results.map(r => ({ name: r.name, value: r.value }))
                )
                .setColor('#2b2d31')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] }).catch(() => { });
        } catch (err) {
            console.error('Ping command error:', err);
            await interaction.editReply({ content: '❌ Đã xảy ra lỗi khi kiểm tra bot.' }).catch(() => { });
        }
    }
};
