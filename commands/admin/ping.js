// commands/admin/ping.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const MonitoredBot = require('../../models/MonitoredBot');

/**
 * Yêu cầu Node >= 18 (fetch global có sẵn).
 *
 * Tùy chỉnh:
 * - TIMEOUT_MS: timeout cho fetch (ms)
 * - SLOW_MS: ngưỡng xem là "chậm"
 * - HUNG_THRESHOLD_SEC: nếu lastUpdated > ngưỡng thì coi là "treo lệnh"
 * - BOTS_PER_EMBED: số field bot trên mỗi embed (<= 25)
 */
const TIMEOUT_MS = 5000;
const SLOW_MS = 3000;
const HUNG_THRESHOLD_SEC = 300; // 5 phút
const BOTS_PER_EMBED = 20; // an toàn (<= 25)

/** fetch với timeout dùng AbortController (Node >= 18) */
function fetchWithTimeout(url, options = {}, timeout = TIMEOUT_MS) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout).unref?.() ?? setTimeout(() => controller.abort(), timeout);
    const signal = controller.signal;
    return fetch(url, { ...options, signal })
        .finally(() => clearTimeout(id));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Kiểm tra trạng thái các bot được giám sát'),

    async execute(interaction) {
        try {
            // Defer reply để có thời gian xử lý
            await interaction.deferReply({ ephemeral: true }).catch(() => { });

            const bots = await MonitoredBot.find({ isActive: true }).lean();
            if (!bots || !bots.length) {
                return interaction.editReply({ content: '⚠️ Không có bot nào được giám sát.' }).catch(() => { });
            }

            // Ping tất cả bot song song
            const checks = bots.map(async (bot) => {
                const displayName = bot.name || `Bot-${bot._id}`;
                const start = Date.now();

                try {
                    const res = await fetchWithTimeout('https://discord.com/api/v10/users/@me', {
                        headers: { Authorization: `Bot ${bot.token}` },
                    }, TIMEOUT_MS);

                    const ms = Date.now() - start;
                    let emoji = res.ok ? '✅' : '❌';
                    let statusLabel = res.ok ? 'Online' : 'Offline';
                    let note = '';

                    if (res.ok && ms > SLOW_MS) {
                        statusLabel = 'Online (chậm)';
                        note = 'Chậm';
                    }

                    // Kiểm tra lastUpdated để phát hiện treo lệnh
                    if (res.ok && bot.lastUpdated) {
                        try {
                            const lastUpdated = new Date(bot.lastUpdated);
                            const diffSec = (Date.now() - lastUpdated.getTime()) / 1000;
                            if (diffSec > HUNG_THRESHOLD_SEC) {
                                // ưu tiên đánh dấu "treo" hơn "chậm"
                                statusLabel = 'Online nhưng không xử lý lệnh (treo?)';
                                emoji = '⚠️';
                                note = 'Treo';
                            }
                        } catch (e) {
                            // ignore parse error
                        }
                    }

                    const lastCommand = bot.lastCommand ? `${bot.lastCommand} (${bot.lastStatus || 'unknown'})` : 'N/A';
                    const lastActivity = bot.lastUpdated ? `<t:${Math.floor(new Date(bot.lastUpdated).getTime() / 1000)}:R>` : 'N/A';

                    const value = [
                        `**Trạng thái:** ${statusLabel}`,
                        `**Phản hồi:** ${ms}ms`,
                        `**Last command:** ${lastCommand}`,
                        `**Last activity:** ${lastActivity}`
                    ].join('\n');

                    return { name: `${emoji} ${displayName}`, value, ms: res.ok ? ms : null, statusLabel, raw: { emoji, displayName } };
                } catch (err) {
                    // Trường hợp fetch bị abort/timeout hoặc lỗi mạng
                    const lastCommand = bot.lastCommand ? `${bot.lastCommand} (${bot.lastStatus || 'unknown'})` : 'N/A';
                    const lastActivity = bot.lastUpdated ? `<t:${Math.floor(new Date(bot.lastUpdated).getTime() / 1000)}:R>` : 'N/A';
                    const value = [
                        `**Trạng thái:** Offline hoặc không phản hồi`,
                        `**Phản hồi:** N/A`,
                        `**Last command:** ${lastCommand}`,
                        `**Last activity:** ${lastActivity}`
                    ].join('\n');

                    return { name: `❌ ${displayName}`, value, ms: null, statusLabel: 'Offline', raw: { displayName } };
                }
            });

            const settled = await Promise.allSettled(checks);
            const results = settled.map(s => (s.status === 'fulfilled' ? s.value : { name: '⚠️ Lỗi', value: 'Không thể kiểm tra bot này', ms: null, statusLabel: 'Error' }));

            // Tính toán summary
            let online = 0, offline = 0, slow = 0, hung = 0;
            const msList = [];
            for (const r of results) {
                if (!r || !r.statusLabel) continue;
                if (r.statusLabel.startsWith('Online')) {
                    online++;
                }
                if (r.statusLabel.toLowerCase().includes('offline')) offline++;
                if (r.statusLabel.toLowerCase().includes('chậm')) slow++;
                if (r.statusLabel.toLowerCase().includes('treo')) hung++;
                if (typeof r.ms === 'number') msList.push(r.ms);
            }
            const avg = msList.length ? Math.round(msList.reduce((a, b) => a + b, 0) / msList.length) : 'N/A';
            const fastest = msList.length ? Math.min(...msList) : 'N/A';
            const slowest = msList.length ? Math.max(...msList) : 'N/A';

            // Tạo embed đầu với summary
            const headerEmbed = new EmbedBuilder()
                .setTitle('⚡ Trạng thái Bot Monitor')
                .setDescription(`Kiểm tra ${bots.length} bot được giám sát`)
                .addFields(
                    { name: '📊 Tổng quan', value: `Online: **${online}**\nChậm: **${slow}**\nTreo: **${hung}**\nOffline: **${offline}**`, inline: true },
                    { name: '⏱ Thời gian (ms)', value: `Trung bình: **${avg}**\nNhanh nhất: **${fastest}**\nChậm nhất: **${slowest}**`, inline: true }
                )
                .setColor('#2b2d31')
                .setTimestamp();

            // Chia các bot thành nhiều embed nếu cần (mỗi embed <= BOTS_PER_EMBED fields)
            const botFields = results.map(r => ({ name: r.name, value: r.value }));
            const embeds = [headerEmbed];
            for (let i = 0; i < botFields.length; i += BOTS_PER_EMBED) {
                const chunk = botFields.slice(i, i + BOTS_PER_EMBED);
                const e = new EmbedBuilder()
                    .setColor('#ffccff')
                    .setTimestamp()
                    .setFooter({ text: `Trang ${Math.floor(i / BOTS_PER_EMBED) + 1} / ${Math.ceil(botFields.length / BOTS_PER_EMBED)}` });

                // addFields expects array of {name, value}
                e.addFields(chunk);
                embeds.push(e);
            }

            // Nếu quá nhiều embed (Discord giới hạn embed / message), cắt bớt và báo
            const MAX_EMBEDS = 10; // an toàn
            if (embeds.length > MAX_EMBEDS) {
                // giữ header + MAX_EMBEDS-1 embed chi tiết đầu tiên
                const trimmed = embeds.slice(0, MAX_EMBEDS);
                trimmed[0].addFields({ name: '⚠️ Lưu ý', value: `Có quá nhiều bot để hiển thị (${bots.length}). Hiển thị ${(MAX_EMBEDS - 1) * BOTS_PER_EMBED} bot đầu tiên.` });
                await interaction.editReply({ embeds: trimmed }).catch(() => { });
            } else {
                await interaction.editReply({ embeds }).catch(() => { });
            }

        } catch (err) {
            console.error('Ping command error:', err);
            // Cố gắng trả lỗi cho user mà không crash
            try {
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply({ content: '❌ Đã xảy ra lỗi khi kiểm tra trạng thái bot. Kiểm tra logs server.' }).catch(() => { });
                } else {
                    await interaction.reply({ content: '❌ Đã xảy ra lỗi khi kiểm tra trạng thái bot. Kiểm tra logs server.', ephemeral: true }).catch(() => { });
                }
            } catch (e) {
                // nothing more we can do
            }
        }
    },
};
