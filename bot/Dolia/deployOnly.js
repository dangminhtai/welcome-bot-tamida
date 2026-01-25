/**
 * Deploy lệnh slash lên Discord (không chạy bot), dùng đúng cơ chế của Haruna:
 *
 * 1. Bot cha (MonitoredBot, DB root): lấy token, clientId, mongoUri của Haruna.
 * 2. DB Haruna (mongoUri): collection Command cache dataJSON từng lệnh.
 * 3. compareCommands: so sánh cmd.data.toJSON() với Command trong DB Haruna → hasChanges.
 * 4. Chỉ gọi Discord API (put) khi hasChanges.
 *
 * Chạy từ bot/Haruna: node deployOnly.js
 *
 * .env (project root): MONGO_URI (DB chứa MonitoredBot).
 * Tùy chọn: GUILD_ID = ID server test — deploy thêm vào guild đó khi hasChanges.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { REST, Routes } from 'discord.js';
import { loadCommands, deployCommands } from './deployCommands.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config();
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function main() {
    const rootMongo = process.env.MONGO_URI;
    if (!rootMongo) {
        console.error('❌ Cần MONGO_URI trong .env (project root) — DB chứa MonitoredBot.');
        process.exit(1);
    }

    // 1) DB root: dùng createConnection riêng — KHÔNG dùng mongoose.connection (default)
    //    để sau này Command (gắn default) CHỈ ghi vào DB Haruna.
    const rootConn = mongoose.createConnection(rootMongo);
    await rootConn.asPromise();
    const bot = await rootConn.db.collection('monitoredbots').findOne({ name: 'Haruna' });
    await rootConn.close();

    if (!bot) {
        console.error('❌ Không tìm thấy MonitoredBot name = "Haruna" trong DB.');
        process.exit(1);
    }
    if (!bot.token || !bot.clientId) {
        console.error('❌ MonitoredBot "Haruna" thiếu token hoặc clientId.');
        process.exit(1);
    }
    if (!bot.mongoUri) {
        console.error('❌ MonitoredBot "Haruna" thiếu mongoUri (DB chứa Command).');
        process.exit(1);
    }

    // 2) DB Haruna: mongoose.connection (default) CHỈ connect tới mongoUri Haruna.
    //    Command (trong compareCommands) dùng default → ghi đúng collection "commands" ở DB Haruna.
    await mongoose.connect(bot.mongoUri);
    const dbName = mongoose.connection.db.databaseName;
    console.log('📂 Command ghi/đọc tại DB:', dbName, '| collection: commands');

    process.env.DISCORD_TOKEN = bot.token;
    process.env.CLIENT_ID = bot.clientId;

    const commandsPath = path.join(__dirname, 'commands');
    const loadResult = await loadCommands(commandsPath, null);
    await deployCommands(loadResult);

    // 3) (Tùy chọn) Deploy vào guild — chỉ khi có thay đổi
    const guildId = process.env.GUILD_ID?.trim();
    if (guildId && loadResult.hasChanges && loadResult.commands?.length) {
        try {
            const rest = new REST({ version: '10' }).setToken(bot.token);
            await rest.put(Routes.applicationGuildCommands(bot.clientId, guildId), {
                body: loadResult.commands,
            });
            console.log(`✅ Guild (${guildId}): đã deploy ${loadResult.commands.length} lệnh.`);
        } catch (e) {
            console.error('❌ Lỗi deploy guild:', e.message);
        }
    }

    await mongoose.disconnect();
}

main().catch((e) => {
    console.error('❌', e.message);
    process.exit(1);
});
