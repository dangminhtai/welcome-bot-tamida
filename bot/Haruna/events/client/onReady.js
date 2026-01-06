import { Events } from 'discord.js';

export default (client) => {
    client.once(Events.ClientReady, () => {
        console.log(`Bot đã đăng nhập dưới tên ${client.user.tag}`);
    });
};
