// seedBots.js
const mongoose = require('mongoose');
require('dotenv').config();
const MonitoredBot = require('../models/MonitoredBot');

const BOT_DATA = [
    { name: 'Furina', botId: '1379219992179900588' },
    { name: 'Hu Tao', botId: '1382760311827857521' },
    { name: 'Ayaka', botId: '1381462269279604736' }
];

async function main() {
    await mongoose.connect(process.env.MONGO_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    });
    console.log('Connected to DB');

    for (const bot of BOT_DATA) {
        // kiểm tra nếu chưa tồn tại thì mới thêm
        const exists = await MonitoredBot.findOne({ botId: bot.botId });
        if (!exists) {
            await MonitoredBot.create(bot);
            console.log(`Added bot: ${bot.name}`);
        } else {
            console.log(`Bot already exists: ${bot.name}`);
        }
    }

    console.log('Done!');
    await mongoose.disconnect();
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
