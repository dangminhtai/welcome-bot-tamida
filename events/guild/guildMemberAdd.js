import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import WelcomeMessage from "../../models/WelcomeMessage.js";
import WelcomeConfig from "../../models/WelcomeConfig.js"; // Or use hardcoded config if preferred

const config = {
    welcomeChannel: 'welcome' // Should ideally come from DB/Config
};

export default (client) => {
    client.on('guildMemberAdd', async (member) => {
        // Attempt to fetch DB config if needed, otherwise use default

        const channel = member.guild.channels.cache.find(ch => ch.name === config.welcomeChannel && ch.type === 0);
        if (!channel) return;

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
                .setCustomId(customId)
                .setLabel('👋 Welcome!')
                .setStyle(ButtonStyle.Primary));

        // Gửi message
        try {
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

            console.log(`✅ [EVENT] Đã gửi welcome message cho ${member.user.tag}`);
        } catch (error) {
            console.error(`❌ [EVENT] Lỗi gửi welcome message: ${error.message}`);
        }
    });
};
