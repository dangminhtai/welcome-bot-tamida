import { config as config$0 } from "dotenv";
import express from "express";
import discord from "discord.js";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { startNewsPoster } from "./newsPoster.js";
import connectDB from "./db.js";
import WelcomeMessage from "./models/WelcomeMessage.js";
import { loadCommands } from "./utils/commandLoader.js";
import monitorBots from "./events/monitorBots.js";
import MonitoredBot from "./models/MonitoredBot.js";
import "./events/keepAlive.js";
({ config: config$0 }.config());
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Collection, Partials, Events } = discord;
const ADMIN_ID = '1149477475001323540';
// === 1. Khởi tạo Discord Client ===
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMembers, // <-- thêm
        GatewayIntentBits.GuildPresences, // <-- thêm
    ],
    partials: [Partials.Channel, Partials.Message, Partials.User, Partials.GuildMember]
});
async function getBotsFromDB() {
    try {
        const bots = await MonitoredBot.find({ isActive: true }).lean();
        return bots.map(bot => ({ name: bot.name, token: bot.token }));
    }
    catch (err) {
        console.error('❌ Lỗi khi load bot từ DB:', err);
        return [];
    }
}
// === 2. Tải Slash Commands từ thư mục ===
client.commands = new Collection();
const commands = [];
function getAllCommandFiles(dirPath, arrayOfFiles = []) {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
        const fullPath = path.join(dirPath, file);
        if (fs.statSync(fullPath).isDirectory()) {
            getAllCommandFiles(fullPath, arrayOfFiles);
        }
        else if (file.endsWith('.js')) {
            arrayOfFiles.push(fullPath);
        }
    }
    return arrayOfFiles;
}
//Load commands
const commandFiles = getAllCommandFiles(path.join(__dirname, 'commands'));
for (const file of commandFiles) {
    try {
        const commandModule = await import(pathToFileURL(file).href);
        const command = commandModule.default || commandModule;

        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
            commands.push(command.data.toJSON());
            console.log(`✅ Đã load lệnh: ${command.data.name}`);
        }
        else {
            console.warn(`⚠️ Thiếu "data" hoặc "execute" trong lệnh: ${file}`);
        }
    }
    catch (err) {
        console.error(`❌ Lỗi khi load lệnh từ: ${file}`, err);
    }
}
//Xử lý sự kiện
// const interactionHandler = require('./events/interactionCreate');
// client.on(Events.InteractionCreate, async (interaction) => {
//   if (!(await dbCheck(interaction))) return; // check DB trước
//   await interactionHandler.execute(interaction);
// });
await loadCommands(client, path.join(__dirname, 'commands'));
// // === 5. Xử lý MessageCreate (tin nhắn) ===
// const messageListener = require('./events/messageListener');
// client.on(Events.MessageCreate, async (message) => {
//   try {
//     await messageListener.execute(message);
//   } catch (error) {
//     console.error('❌ Lỗi khi xử lý tin nhắn:', error);
//   }
// });
// Khởi tạo Express server để giữ bot online (cho Replit/Vercel)
const app = express();
connectDB();
app.get('/', (req, res) => {
    res.send('Bot is running!');
});
app.listen(process.env.PORT || 8080, () => {
    console.log(`Ping server is running on port ${process.env.PORT || 8080}`);
});
const config = {
    welcomeChannel: 'welcome' // đổi theo tên kênh thực tế
};
// ✅ Khi bot sẵn sàng
client.once('ready', async () => {
    console.log(`✅ Bot đang chạy: ${client.user.tag}`);
    startNewsPoster(client);
    const botsToMonitor = await getBotsFromDB(); // load từ DB
    monitorBots(client, ADMIN_ID, botsToMonitor); // vẫn dùng monitorBots như cũ
});
// ✅ Khi có thành viên mới join
client.on('guildMemberAdd', async (member) => {
    const channel = member.guild.channels.cache.find(ch => ch.name === config.welcomeChannel && ch.type === 0);
    if (!channel)
        return;
    // Sinh customId duy nhất cho nút
    const customId = `welcome_${member.id}`;
    // Tạo Embed
    const welcomeEmbed = new EmbedBuilder()
        .setColor('#ffccff')
        .setTitle('🎉 Welcome to Genshin Impact Bot!')
        .setDescription(`We're so happy you joined us, ${member}! 💫\n` +
            '⠄･ ⋆ ･ ⠄⠂⋆ ･ ⠄･ ⋆ ･ ⠄･ ⋆ ･ ⠄⠂⋆ ･ ⠄･ ⋆ ･⠄⋆ ･ ⠄･ ⋆\n\n' +
            `**Check these channels first!**\n` +
            `₊˚ღ <#1379146666053074944>\n` +
            `˚₊‧ <#1381738133581987890>\n` +
            `𓂃 ✿ <#1400636508611809330>\n\n` +
            `Feel free to open up, ask, or chat anytime — you’re super welcome here.\n` +
            `**We hope you have a magical time with us!** 🌈`)
        .setImage('https://i.ibb.co/hFxFzMNn/welcome-klee.gif')
        .setFooter({ text: `You are member #${member.guild.memberCount} of this server!` })
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 1024 }))
        .setTimestamp();
    // Tạo Button
    const row = new ActionRowBuilder()
        .addComponents(new ButtonBuilder()
            .setCustomId(customId) // ✅ ID riêng cho từng member
            .setLabel('👋 Welcome!')
            .setStyle(ButtonStyle.Primary));
    // Gửi message
    const message = await channel.send({
        embeds: [welcomeEmbed],
        components: [row]
    });
    // Lưu vào DB
    await WelcomeMessage.create({
        guildId: member.guild.id,
        memberId: member.id,
        channelId: channel.id,
        messageId: message.id,
        customId
    });
    console.log(`✅ Đã gửi welcome message cho ${member.user.tag}`);
});
// ✅ Khi bấm nút (không bị hết hạn vì dùng event global)
// ✅ Xử lý Interaction (Slash Command + Button)
import interactionHandler from "./events/interactionCreate.js";
interactionHandler(client);
// ✅ Khi member rời → xóa message + DB
client.on('guildMemberRemove', async (member) => {
    try {
        const doc = await WelcomeMessage.findOne({ guildId: member.guild.id, memberId: member.id });
        if (!doc)
            return;
        const channel = await member.guild.channels.fetch(doc.channelId);
        const message = await channel.messages.fetch(doc.messageId);
        await message.delete();
        await WelcomeMessage.deleteOne({ _id: doc._id });
        console.log(`🗑️ Đã xóa welcome message của ${member.user.tag}`);
    }
    catch (err) {
        console.error('❌ Không thể xóa message:', err.message);
    }
});
client.login(process.env.TOKEN);
