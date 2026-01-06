import { MessageFlags } from "discord.js";

export async function handleButton(interaction) {
    if (!interaction.isButton()) return;

    // --- Welcome Button ---
    if (interaction.customId.startsWith('welcome_')) {
        try {
            const { default: WelcomeMessage } = await import('../models/WelcomeMessage.js');
            const doc = await WelcomeMessage.findOne({ customId: interaction.customId });

            if (!doc) {
                // await interaction.reply({ content: 'Message configuration not found.', flags: MessageFlags.Ephemeral });
                return;
            }

            await interaction.reply({
                content: `Thanks ${interaction.user} for welcoming <@${doc.memberId}>!`,
                flags: MessageFlags.Ephemeral
            });
        } catch (err) {
            console.error("Handler: Welcome Button Error:", err);
            await interaction.reply({ content: 'An error occurred.', flags: MessageFlags.Ephemeral }).catch(() => { });
        }
    }

    // Future button logic here
}
