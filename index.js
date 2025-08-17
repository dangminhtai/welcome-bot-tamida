require('dotenv').config();
const express = require('express');
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { startNewsPoster } = require("./newsPoster");
const connectDB = require("./db");
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});
const app = express();
//connect DB
connectDB();
app.get('/', (req, res) => {
  res.send('Bot is running!');
});

app.listen(process.env.PORT || 8080, () => {
  console.log(`Ping server is running on port ${process.env.PORT || 8080}`);
});

const config = {
  welcomeChannel: 'welcome'
};

client.once('ready', () => {
  console.log(`✅ Bot đang chạy: ${client.user.tag}`);
  startNewsPoster(client); // ✅ tích hợp news vào bot
});

client.on('guildMemberAdd', async (member) => {
  // Tìm kênh welcome
  const channel = member.guild.channels.cache.find(
    ch => ch.name === config.welcomeChannel && ch.type === 0
  );
  if (!channel) return;

  // Embed chào mừng
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

  // Nút bấm
  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('welcome_button')
        .setLabel('👋 Welcome!')
        .setStyle(ButtonStyle.Primary)
    );

  // Gửi tin nhắn
  const message = await channel.send({
    embeds: [welcomeEmbed],
    components: [row]
  });

  // Collector xử lý bấm nút
  const collector = message.createMessageComponentCollector({ time: 300000 });
  collector.on('collect', async (interaction) => {
    if (interaction.customId === 'welcome_button') {
      await interaction.reply({
        content: `Thanks ${interaction.user} for welcoming ${member}!`,
        ephemeral: true
      });
    }
  });
});

client.login(process.env.TOKEN);
