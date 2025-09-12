// // pushBots.js
// require('dotenv').config();
// const mongoose = require('mongoose');
// const MonitoredBot = require('../models/MonitoredBot');

// const bots = [

// ];

// async function pushBots() {
//     try {
//         await mongoose.connect(process.env.MONGO_URI, {
//             useNewUrlParser: true,
//             useUnifiedTopology: true
//         });

//         for (const bot of bots) {
//             // kiểm tra nếu bot đã tồn tại thì không insert trùng
//             const exists = await MonitoredBot.findOne({ name: bot.name });
//             if (!exists) {
//                 await MonitoredBot.create(bot);
//                 console.log(`✅ Đã thêm bot: ${bot.name}`);
//             } else {
//                 console.log(`⚠️ Bot ${bot.name} đã tồn tại, bỏ qua`);
//             }
//         }

//         console.log('✅ Hoàn tất push các bot lên DB');
//         process.exit(0);
//     } catch (err) {
//         console.error('❌ Lỗi khi push bot:', err);
//         process.exit(1);
//     }
// }

// pushBots();
