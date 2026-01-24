import { SlashCommandBuilder } from 'discord.js';
import { poru } from '../../utils/LavalinkManager.js';

export default {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Xem hàng chờ nhạc (Lavalink)'),

    async execute(interaction) {
        const player = poru.players.get(interaction.guild.id);

        if (!player || (player.queue.length === 0 && !player.currentTrack)) {
            return interaction.reply({ content: '📭 Hàng chờ trống.', ephemeral: true });
        }

        const queue = player.queue;
        const currentTrack = player.currentTrack;

        let content = `**Đang phát:** [${currentTrack.info.title}](${currentTrack.info.uri})\n`;
        content += `**Sắp phát:**\n`;

        if (queue.length > 0) {
            queue.slice(0, 10).forEach((track, index) => {
                content += `${index + 1}. [${track.info.title}](${track.info.uri}) \n`;
            });
            if (queue.length > 10) content += `...và còn ${queue.length - 10} bài nữa.`;
        } else {
            content += '(Hết)';
        }

        return interaction.reply({ content: content, ephemeral: true });
    },
};

