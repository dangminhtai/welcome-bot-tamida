import { Events, MessageFlags } from "discord.js";

export default (client) => {
    client.on(Events.InteractionCreate, async interaction => {

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

        // --- 2. XỬ LÝ LỆNH SLASH ---
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error("Command Execution Error:", error);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: 'Có lỗi xảy ra khi thực hiện lệnh này!', flags: MessageFlags.Ephemeral });
                } else {
                    await interaction.followUp({ content: 'Có lỗi xảy ra khi thực hiện lệnh này!', flags: MessageFlags.Ephemeral });
                }
            }
        }
    });
}
