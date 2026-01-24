import { Events } from 'discord.js';
import { startNewsPoster } from "../../helpers/newPoster.js";
import { startGiftcodePoster } from "../../helpers/giftcodePoster.js";
import monitorBots from "../monitorBots.js";
import MonitoredBot from "../../models/MonitoredBot.js";

const ADMIN_ID = '1149477475001323540';

export default (client) => {
    client.once(Events.ClientReady, async () => {
        console.log(`✅ [EVENT] Bot đang chạy: ${client.user.tag}`);

        // 1. Start News Poster (HoYoLAB)
        startNewsPoster(client);

        // 2. Start Gift Code Poster
        startGiftcodePoster(client);

        // 3. Start Bot Monitor
        try {
            const bots = await MonitoredBot.find({ isActive: true }).lean();
            const botsToMonitor = bots.map(bot => ({ name: bot.name, token: bot.token }));
            monitorBots(client, ADMIN_ID, botsToMonitor);
            // console.log(`✅ [MONITOR] Started monitoring ${botsToMonitor.length} bots.`);
        } catch (err) {
            console.error('❌ [MONITOR] Setup Error:', err.message);
        }
    });
};
