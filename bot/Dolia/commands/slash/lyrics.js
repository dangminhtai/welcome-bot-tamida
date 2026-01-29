import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import GeminiLyrics from '../../class/GeminiLyrics.js';
import { sendSafeMessage } from '../../utils/messageHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('lyrics')
        .setDescription('Tìm kiếm lời bài hát bằng AI (Grounding Search)')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('Đoạn lời bài hát hoặc tên bài hát')
                .setRequired(true)
                .setMinLength(30)
                .setMaxLength(200)
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const query = interaction.options.getString('query');

        try {
            const data = await GeminiLyrics.findLyrics(query);

            if (!data.is_found) {
                return interaction.editReply(`❌ Xin lỗi, tôi không tìm thấy bài hát nào khớp với nội dung: \`${query}\``);
            }

            const embed = new EmbedBuilder()
                .setTitle(`🎵 ${data.song_title}`)
                .setAuthor({ name: data.artist })
                .setColor(0x1DB954) // Spotify Green
                .setThumbnail(data.thumbnail_url || 'https://cdn-icons-png.flaticon.com/512/3844/3844724.png')
                .setFooter({ text: 'Dolia Lyrics Search' })
                .setTimestamp();

            if (data.release_year) {
                embed.addFields({ name: '📅 Năm phát hành', value: String(data.release_year), inline: true });
            }

            // Xử lý lời bài hát dài
            if (data.lyrics.length <= 2000) {
                embed.setDescription(data.lyrics);
                await interaction.editReply({ embeds: [embed] });
            } else {
                // Nếu dài quá 2000, cắt bớt hiển thị trên embed và gửi kèm file
                embed.setDescription(data.lyrics.substring(0, 1900) + '...\n\n*(Xem bản đầy đủ ở file đính kèm bên dưới)*');
                await interaction.editReply({ embeds: [embed] });

                await sendSafeMessage(interaction, data.lyrics, {
                    forceFile: true,
                    fileName: `${data.song_title}_lyrics.md`.replace(/\s+/g, '_'),
                    fileContent: `📜 Đây là lời bài hát đầy đủ cho bài **${data.song_title}**:`
                });
            }

        } catch (error) {
            console.error('Lyrics Command Error:', error);
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply('❌ Đã xảy ra lỗi khi tìm kiếm lời bài hát. Có thể do lỗi kết nối AI hoặc không tìm thấy kết quả phù hợp.');
            } else {
                await interaction.reply('❌ Đã xảy ra lỗi khi tìm kiếm lời bài hát.');
            }
        }
    },
};
