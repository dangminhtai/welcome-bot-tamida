import { Events, MessageFlags } from "discord.js";
import { getConfig } from "../utils/configUtils.js";

export default (client) => {
    client.on(Events.InteractionCreate, async interaction => {
        // --- CHECK MOI TRUONG DEPLOY ---
        const isLinux = process.platform === 'linux';
        const isStopDeployActive = await getConfig('stop_deploy');

        if (isLinux && isStopDeployActive) {
            // Stop immediately if on Linux and stop_deploy is active
            return;
        }

        // --- 0. XỬ LÝ WELCOME BUTTON ---
        if (interaction.isButton() && interaction.customId.startsWith('welcome_')) {
            try {
                // Dynamic import to avoid circular dependency issues if any
                const { default: WelcomeMessage } = await import('../../models/WelcomeMessage.js');
                const doc = await WelcomeMessage.findOne({ customId: interaction.customId });
                if (!doc) return;

                await interaction.reply({
                    content: `Thanks ${interaction.user} for welcoming <@${doc.memberId}>!`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            } catch (err) {
                console.error("Welcome Button Error:", err);
            }
        }

        // --- 1. XỬ LÝ ROLE BUTTON (toggle) ---
        if (interaction.isButton() && interaction.customId.startsWith('role_')) {
            try {
                if (!interaction.guild) {
                    return interaction.reply({ content: '❌ Chỉ dùng được trong server.', flags: MessageFlags.Ephemeral });
                }
                const { default: RoleConfig } = await import('../../models/RoleConfig.js');
                const cfg = await RoleConfig.findOne({ buttonId: interaction.customId, guildId: interaction.guild.id });
                if (!cfg) {
                    return interaction.reply({ content: '❌ Cấu hình role không tồn tại hoặc đã bị xóa.', flags: MessageFlags.Ephemeral });
                }
                const role = interaction.guild.roles.cache.get(cfg.roleId);
                if (!role) {
                    return interaction.reply({ content: '❌ Role đã bị xóa khỏi server.', flags: MessageFlags.Ephemeral });
                }
                const member = interaction.member;
                if (!member) {
                    return interaction.reply({ content: '❌ Không thể lấy thông tin thành viên.', flags: MessageFlags.Ephemeral });
                }
                const hasRole = member.roles.cache.has(cfg.roleId);
                if (hasRole) {
                    await member.roles.remove(cfg.roleId);
                    return interaction.reply({ content: `✅ Đã bỏ role **${cfg.label}**.`, flags: MessageFlags.Ephemeral });
                } else {
                    await member.roles.add(cfg.roleId);
                    return interaction.reply({ content: `✅ Đã thêm role **${cfg.label}**.`, flags: MessageFlags.Ephemeral });
                }
            } catch (err) {
                console.error("Role Button Error:", err);
                const msg = err.code === 50013
                    ? '❌ Bot không đủ quyền **Manage Roles** hoặc role cao hơn bot.'
                    : (err.message || '❌ Có lỗi khi thay đổi role.');
                if (!interaction.replied && !interaction.deferred) {
                    return interaction.reply({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => { });
                }
                return interaction.followUp({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => { });
            }
        }

        // --- 2. XỬ LÝ AUTocomplete (phải trước ChatInputCommand) ---
        if (interaction.isAutocomplete()) {
            const command = client.commands.get(interaction.commandName);
            if (command?.autocomplete) {
                try { await command.autocomplete(interaction); } catch (e) { console.error('Autocomplete error:', e); }
            }
            return;
        }

        // --- 3. XỬ LÝ LỆNH SLASH ---
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error("Command Execution Error:", error);
                try {
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: 'Có lỗi xảy ra khi thực hiện lệnh này!', flags: MessageFlags.Ephemeral });
                    } else {
                        await interaction.followUp({ content: 'Có lỗi xảy ra khi thực hiện lệnh này!', flags: MessageFlags.Ephemeral });
                    }
                } catch (e) {
                    // Interaction có thể đã hết hạn (Unknown interaction) — bỏ qua để tránh crash
                }
            }
        }
    });
}
