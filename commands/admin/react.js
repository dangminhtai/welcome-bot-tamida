// commands/react.js
const { SlashCommandBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("react")
        .setDescription("Bot reacts emoji")
        .addStringOption(option =>
            option
                .setName("emoji")
                .setDescription("Nhập emoji (🍓 hoặc <:name:id>, cách nhau bằng dấu phẩy).")
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName("position")
                .setDescription("Thứ tự tin nhắn tính từ mới nhất (1 = gần nhất, 2 = thứ hai, v.v.)")
                .setMinValue(1)
        ),

    async execute(interaction) {
        const guild = interaction.guild;
        const channel = interaction.channel;

        try {
            const emojiInput = interaction.options.getString("emoji");
            const position = interaction.options.getInteger("position") || 1; // mặc định = tin gần nhất
            const emojiArray = emojiInput.split(",").map(e => e.trim()).filter(Boolean);

            if (emojiArray.length === 0) {
                await interaction.reply({ content: "❌ Danh sách emoji không hợp lệ.", ephemeral: true });
                return;
            }

            const guildEmojis = await guild.emojis.fetch();

            // Lấy danh sách tin nhắn (ví dụ lấy 10 tin gần nhất)
            const messages = await channel.messages.fetch({ limit: 10 });
            const sortedMessages = Array.from(messages.values())
                .filter(msg => msg.id !== interaction.id)
                .sort((a, b) => b.createdTimestamp - a.createdTimestamp);

            const targetMessage = sortedMessages[position - 1];
            if (!targetMessage) {
                await interaction.reply({
                    content: `❌ Không tìm thấy tin nhắn thứ ${position}.`,
                    ephemeral: true
                });
                return;
            }

            for (const inputEmoji of emojiArray) {
                let emojiToReact = inputEmoji;
                const match = inputEmoji.match(/<?a?:?(\w+):?(\d+)?>?/);
                if (match) {
                    const name = match[1];
                    const id = match[2];
                    if (id) {
                        emojiToReact = `<${inputEmoji.startsWith("<a:") ? "a" : ""}:${name}:${id}>`;
                    } else {
                        const found = guildEmojis.find(e => e.name === name);
                        if (found) emojiToReact = found.toString();
                    }
                }

                try {
                    await targetMessage.react(emojiToReact);
                } catch {
                    console.log(`⚠️ Không thể react emoji: ${emojiToReact}`);
                }
            }

            await interaction.reply({
                content: `✅ Đã react ${emojiArray.join(" ")} vào tin nhắn thứ ${position} từ mới nhất.`,
                ephemeral: true
            });
        } catch (err) {
            console.error("❌ Lỗi react:", err);
            await interaction.reply({ content: "Có lỗi khi bot react emoji.", ephemeral: true });
        }
    },
};
