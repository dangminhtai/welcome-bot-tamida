// events/interactionCreate.js
const RoleConfig = require("../models/RoleConfig");

module.exports = async (interaction) => {
    if (!interaction.isButton()) return;

    const config = await RoleConfig.findOne({ guildId: interaction.guild.id, buttonId: interaction.customId });
    if (!config) return;

    const role = interaction.guild.roles.cache.get(config.roleId);
    if (!role) return interaction.reply({ content: "❌ Role not found in server.", ephemeral: true });

    if (interaction.member.roles.cache.has(role.id)) {
        await interaction.member.roles.remove(role);
        return interaction.reply({ content: `❌ Removed role ${role.name}`, ephemeral: true });
    } else {
        await interaction.member.roles.add(role);
        return interaction.reply({ content: `✅ Added role ${role.name}`, ephemeral: true });
    }
};
