// events/monitorBots.js
const MonitorSettings = require('../models/MonitorSettings');
const MonitoredBot = require('../models/MonitoredBot');

module.exports = (client, adminId) => {
    const notifyAdmin = async (message) => {
        try {
            const settings = await MonitorSettings.findOne({ adminId });
            if (!settings || settings.notificationsEnabled) {
                const admin = await client.users.fetch(adminId);
                await admin.send(`⚠️ [BOT MONITOR] ${message}`);
            }
        } catch (err) {
            console.error('❌ Không gửi được thông báo cho admin:', err.message);
        }
    };

    // Hàm tìm presence qua mutual guilds
    const getPresenceFromMutualGuilds = async (userId) => {
        for (const [guildId, guild] of client.guilds.cache) {
            try {
                const member = await guild.members.fetch(userId).catch(() => null);
                if (member) {
                    const status = member.presence?.status || 'offline';
                    return { found: true, guildId, status };
                }
            } catch {
                continue;
            }
        }
        return { found: false, status: 'offline' };
    };

    const checkBotStatus = async (bot) => {
        try {
            const res = await getPresenceFromMutualGuilds(bot.botId);
            const newStatus = res.status;

            if (bot.lastStatus !== newStatus) {
                // Status changed → notify admin
                await notifyAdmin(
                    `Bot **${bot.name}** đã đổi trạng thái: **${bot.lastStatus} ➝ ${newStatus}**`
                );
                bot.lastStatus = newStatus;
                await bot.save().catch(() => { });
            }
        } catch (err) {
            console.error(`❌ Lỗi khi check bot ${bot.name}:`, err.message);
        }
    };

    // Interval kiểm tra mỗi phút
    setInterval(async () => {
        try {
            const bots = await MonitoredBot.find({ isActive: true });
            bots.forEach(bot => checkBotStatus(bot));
        } catch (err) {
            console.error('❌ Lỗi khi load bots:', err.message);
        }
    }, 60 * 1000);
};
