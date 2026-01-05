const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ban-clean') // Tên lệnh
        .setDescription('Ban user và xóa sạch tin nhắn trong 7 ngày qua (Max API Discord)')
        .addUserOption(option => 
            option.setName('target')
                .setDescription('User muốn ban (Chọn user hoặc dán ID)')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('reason')
                .setDescription('Lý do ban'))
        // Quan trọng: Chỉ cho phép người có quyền Ban mới thấy/dùng lệnh này
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    async execute(interaction) {
        // Defer để tránh timeout nếu Discord phản hồi chậm
        await interaction.deferReply({ ephemeral: true });

        try {
            const targetUser = interaction.options.getUser('target');
            const reason = interaction.options.getString('reason') || 'Phá hoại server (Raid/Spam)';
            const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

            // Kiểm tra quyền hạn: Không cho ban người có quyền cao hơn bot hoặc chính chủ server
            if (member) {
                if (!member.bannable) {
                    return interaction.editReply({ content: '❌ Bot không đủ quyền để ban người này (Role họ cao hơn Bot).' });
                }
            }

            // THỰC HIỆN BAN + XÓA TIN NHẮN
            // deleteMessageSeconds: 604800 giây = 7 ngày (Mức tối đa Discord cho phép)
            await interaction.guild.members.ban(targetUser.id, { 
                deleteMessageSeconds: 604800, 
                reason: reason 
            });

            // Tạo Embed báo cáo
            const embed = new EmbedBuilder()
                .setTitle('🔨 Đã thực thi Ban Hammer')
                .setColor('#ff0000')
                .addFields(
                    { name: 'Đối tượng', value: `${targetUser.tag} (ID: ${targetUser.id})`, inline: false },
                    { name: 'Lý do', value: reason, inline: false },
                    { name: 'Dọn dẹp', value: 'Đã xóa toàn bộ tin nhắn trong 7 ngày qua', inline: false }
                )
                .setTimestamp()
                .setFooter({ text: `Thực hiện bởi: ${interaction.user.tag}` });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error(error);
            await interaction.editReply({ content: `❌ Có lỗi xảy ra: ${error.message}` });
        }
    },
};