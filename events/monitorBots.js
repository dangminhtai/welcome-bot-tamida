// events/monitorBots.js
const fetch = global.fetch; // Node.js >= 18
const MonitorSettings = require('../models/MonitorSettings');

module.exports = (client, adminId, botsToMonitor) => {
    const notifyAdmin = async (message) => {
        try {
            // Lấy setting từ DB
            const settings = await MonitorSettings.findOne({ adminId });

            // Nếu chưa có setting hoặc đã bật thì mới gửi DM
            if (!settings || settings.notificationsEnabled) {
                const admin = await client.users.fetch(adminId);
                await admin.send(`⚠️ [BOT MONITOR] ${message}`);
            }
        } catch (err) {
            console.error('❌ Không gửi được thông báo cho admin:', err.message);
        }
    };

    const checkBotStatus = async (bot) => {
        try {
            const res = await fetch('https://discord.com/api/v10/users/@me', {
                headers: { Authorization: `Bot ${bot.token}` },
            });

            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            // console.log(`✅ Bot ${bot.name} online`);
        } catch (err) {
            notifyAdmin(`Bot ${bot.name} offline hoặc treo lệnh: ${err.message}`);
        }
    };

    // Kiểm tra định kỳ 1 phút
    setInterval(() => {
        botsToMonitor.forEach(bot => checkBotStatus(bot));
    }, 60 * 1000);
};
