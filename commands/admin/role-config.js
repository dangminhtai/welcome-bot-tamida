import discord from "discord.js";
import RoleConfig from "../../models/RoleConfig.js";
// commands/role-config.js
const { SlashCommandBuilder, PermissionFlagsBits, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder } = discord;
export const data = new SlashCommandBuilder()
    .setName("role-config")
    .setDescription("Manage server roles with buttons")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub => sub
        .setName("add")
        .setDescription("Add a new role to menu")
        .addRoleOption(opt => opt.setName("role").setDescription("Role to assign").setRequired(true))
        .addStringOption(opt => opt.setName("label").setDescription("Button label").setRequired(true)))
    .addSubcommand(sub => sub.setName("list").setDescription("Show all configured roles"))
    .addSubcommand(sub => sub.setName("send-menu").setDescription("Send the role selection menu"))
    .addSubcommand(sub => sub
        .setName("remove")
        .setDescription("Remove a role from the menu")
        .addRoleOption(opt => opt.setName("role").setDescription("Role to remove from menu").setRequired(true)));
export async function execute(interaction) {
    if (!interaction.guild) {
        return interaction.reply({ content: "❌ Chỉ dùng được trong server.", ephemeral: true });
    }
    const sub = interaction.options.getSubcommand();
    if (sub === "add") {
        const role = interaction.options.getRole("role");
        const label = interaction.options.getString("label");
        if (!role) {
            return interaction.reply({ content: "❌ Không tìm thấy role. Chỉ dùng trong server và chọn role hợp lệ.", ephemeral: true });
        }
        const buttonId = `role_${role.id}`;
        const exists = await RoleConfig.findOne({ guildId: interaction.guild.id, roleId: role.id });
        if (exists)
            return interaction.reply({ content: "❌ Role already exists in config!", ephemeral: true });
        await RoleConfig.create({
            guildId: interaction.guild.id,
            roleId: role.id,
            buttonId,
            label,
        });
        return interaction.reply({ content: `✅ Added role ${role.name} with button **${label}**`, ephemeral: true });
    }
    if (sub === "list") {
        const configs = await RoleConfig.find({ guildId: interaction.guild.id });
        if (!configs.length)
            return interaction.reply({ content: "No roles configured yet.", ephemeral: true });
        const list = configs.map(c => `- <@&${c.roleId}> → Button: \`${c.label}\``).join("\n");
        return interaction.reply({ content: `Configured Roles:\n${list}`, ephemeral: true });
    }
    if (sub === "send-menu") {
        const configs = await RoleConfig.find({ guildId: interaction.guild.id });
        if (!configs.length)
            return interaction.reply({ content: "No roles configured yet.", ephemeral: true });
        const embed = new EmbedBuilder()
            .setTitle("🎭 Choose Your Roles")
            .setDescription("Click the buttons below to toggle your roles!");
        const rows = [];
        let row = new ActionRowBuilder();
        for (let i = 0; i < configs.length; i++) {
            const cfg = configs[i];
            row.addComponents(new ButtonBuilder()
                .setCustomId(cfg.buttonId)
                .setLabel(cfg.label)
                .setStyle(ButtonStyle.Primary));
            if ((i + 1) % 5 === 0 || i === configs.length - 1) {
                rows.push(row);
                row = new ActionRowBuilder();
            }
        }
        await interaction.channel.send({ embeds: [embed], components: rows });
        return interaction.reply({ content: "✅ Role menu sent!", ephemeral: true });
    }
    if (sub === "remove") {
        const role = interaction.options.getRole("role");
        if (!role) {
            return interaction.reply({ content: "❌ Không tìm thấy role.", ephemeral: true });
        }
        const cfg = await RoleConfig.findOne({ guildId: interaction.guild.id, roleId: role.id });
        if (!cfg)
            return interaction.reply({ content: `❌ Role ${role.name} chưa có trong menu.`, ephemeral: true });
        await RoleConfig.deleteOne({ _id: cfg._id });
        return interaction.reply({ content: `✅ Đã xóa role **${role.name}** khỏi menu.`, ephemeral: true });
    }
}
export default {
    data,
    execute
};
