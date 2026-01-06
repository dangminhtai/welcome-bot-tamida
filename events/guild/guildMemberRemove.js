import WelcomeMessage from "../../models/WelcomeMessage.js";

export default (client) => {
    client.on('guildMemberRemove', async (member) => {
        try {
            const doc = await WelcomeMessage.findOne({ guildId: member.guild.id, memberId: member.id });
            if (!doc) return;

            const channel = await member.guild.channels.fetch(doc.channelId).catch(() => null);
            if (channel) {
                const message = await channel.messages.fetch(doc.messageId).catch(() => null);
                if (message) await message.delete();
            }

            await WelcomeMessage.deleteOne({ _id: doc._id });
            console.log(`🗑️ [EVENT] Đã xóa welcome message của ${member.user.tag}`);
        } catch (err) {
            console.error('❌ [EVENT] Không thể xóa message:', err.message);
        }
    });
};
