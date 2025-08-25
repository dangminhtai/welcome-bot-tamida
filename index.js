require('dotenv').config();
const express = require('express');
const { 
  Client, 
  GatewayIntentBits, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle 
} = require('discord.js');
const { startNewsPoster } = require("./newsPoster");
const connectDB = require("./db");
const WelcomeMessage = require('./models/WelcomeMessage'); // ✅ import model

// Khởi tạo Discord Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

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
client.once('ready', () => {
  console.log(`✅ Bot đang chạy: ${client.user.tag}`);
  startNewsPoster(client);
});

// ✅ Khi có thành viên mới join
client.on('guildMemberAdd', async (member) => {
  const channel = member.guild.channels.cache.find(
    ch => ch.name === config.welcomeChannel && ch.type === 0
  );
  if (!channel) return;

  // Sinh customId duy nhất cho nút
  const customId = `welcome_${member.id}`;

  // Tạo Embed
  const welcomeEmbed = new EmbedBuilder()
    .setColor('#ffccff')
    .setTitle('🎉 Welcome to Genshin Impact Bot!')
    .setDescription(
      `We're so happy you joined us, ${member}! 💫\n` +
      '⠄･ ⋆ ･ ⠄⠂⋆ ･ ⠄･ ⋆ ･ ⠄･ ⋆ ･ ⠄⠂⋆ ･ ⠄･ ⋆ ･⠄⋆ ･ ⠄･ ⋆\n\n' +
      `**Check these channels first!**\n` +
      `₊˚ღ <#1379146666053074944>\n` +
      `˚₊‧ <#1381738133581987890>\n` +
      `𓂃 ✿ <#1400636508611809330>\n\n` +
      `Feel free to open up, ask, or chat anytime — you’re super welcome here.\n` +
      `**We hope you have a magical time with us!** 🌈`
    )
    .setImage('https://i.ibb.co/hFxFzMNn/welcome-klee.gif')
    .setFooter({ text: `You are member #${member.guild.memberCount} of this server!` })
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 1024 }))
    .setTimestamp();

  // Tạo Button
  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(customId) // ✅ ID riêng cho từng member
        .setLabel('👋 Welcome!')
        .setStyle(ButtonStyle.Primary)
    );

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
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  try {
    const doc = await WelcomeMessage.findOne({ customId: interaction.customId });
    if (!doc) return; // Không phải nút trong DB

    await interaction.reply({
      content: `Thanks ${interaction.user} for welcoming <@${doc.memberId}>!`,
      ephemeral: true
    });

    console.log(`✅ ${interaction.user.tag} đã bấm nút chào mừng cho ${doc.memberId}`);
  } catch (err) {
    console.error('❌ Lỗi xử lý interaction:', err.message);
  }
});

// ✅ Khi member rời → xóa message + DB
client.on('guildMemberRemove', async (member) => {
  try {
    const doc = await WelcomeMessage.findOne({ guildId: member.guild.id, memberId: member.id });
    if (!doc) return;

    const channel = await member.guild.channels.fetch(doc.channelId);
    const message = await channel.messages.fetch(doc.messageId);

    await message.delete();
    await WelcomeMessage.deleteOne({ _id: doc._id });

    console.log(`🗑️ Đã xóa welcome message của ${member.user.tag}`);
  } catch (err) {
    console.error('❌ Không thể xóa message:', err.message);
  }
});

client.login(process.env.TOKEN);
