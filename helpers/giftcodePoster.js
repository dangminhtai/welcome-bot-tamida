
import puppeteer from "puppeteer";
import { load } from "cheerio";
import { EmbedBuilder } from "discord.js";
import PostedCodes from "../models/PostedCodes.js";
import NewsChannel from "../models/NewsChannel.js";

// --- CONFIGURATION & CONSTANTS ---
const SCRAPER_CONFIG = {
    url: "https://genshin-impact.fandom.com/wiki/Promotional_Code",
    type: "giftcode",
    timeout: 60000, // Puppeteer takes longer
    interval: 10 * 60 * 1000,
    maxDiscoveredDays: 60
};

// --- HELPER FUNCTIONS ---

function formatDate(date) {
    if (!date || isNaN(date.getTime())) return "—";
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${day}/${month}/${date.getFullYear()}`;
}

function parseDuration(text) {
    if (!text || typeof text !== "string") {
        return { isActive: true, validUntil: null, discoveredAt: null };
    }

    let validUntil = null;
    let isActive = true;
    let discoveredAt = null;

    const validMatch = text.match(/Valid until:\s*([A-Za-z]+\s+\d{1,2},\s*\d{4})/i);
    const discoveredMatch = text.match(/Discovered:\s*([A-Za-z]+\s+\d{1,2},\s*\d{4})/i);

    if (validMatch) {
        const expiryDate = new Date(validMatch[1].trim());
        if (!isNaN(expiryDate.getTime())) {
            validUntil = expiryDate;
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            expiryDate.setHours(0, 0, 0, 0);
            isActive = expiryDate >= today;
        }
    }

    if (discoveredMatch) {
        const discDate = new Date(discoveredMatch[1].trim());
        if (!isNaN(discDate.getTime())) {
            discoveredAt = discDate;
        }
    }

    return { isActive, validUntil, discoveredAt };
}

/**
 * Fetches codes using Puppeteer to bypass Cloudflare/403.
 */
async function fetchActiveCodes() {
    let browser = null;
    try {
        // Launch Puppeteer (Headless)
        browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
            // --disable-dev-shm-usage helps in some containerized envs
        });

        const page = await browser.newPage();

        // Set User-Agent to a real browser's UA
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Go to URL and wait for network idle to ensure content loads
        await page.goto(SCRAPER_CONFIG.url, { waitUntil: 'networkidle2', timeout: SCRAPER_CONFIG.timeout });

        // Get page content
        const content = await page.content();
        const $ = load(content);
        const codes = [];

        let table = $('#Active_Codes').parent().nextAll('table.wikitable').first();
        if (table.length === 0) {
            table = $('table.wikitable').first();
        }

        const IDX = { CODE: 0, SERVER: 1, REWARDS: 2, DURATION: 3 };

        table.find('tbody tr').each((_, row) => {
            const cols = $(row).find('td');
            if (cols.length < 4) return;

            const durationText = $(cols[IDX.DURATION]).text().trim();
            const { isActive, validUntil, discoveredAt } = parseDuration(durationText);

            if (!isActive) return;
            if (!discoveredAt) return;

            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const discDate = new Date(discoveredAt);
            discDate.setHours(0, 0, 0, 0);

            if (!validUntil && discDate.getTime() !== today.getTime()) {
                return;
            }

            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - SCRAPER_CONFIG.maxDiscoveredDays);
            cutoffDate.setHours(0, 0, 0, 0);

            if (discDate < cutoffDate) return;

            const server = $(cols[IDX.SERVER]).text().trim().replace(/\n/g, ", ").slice(0, 200);
            const rewards = $(cols[IDX.REWARDS]).text().trim().replace(/\n/g, ", ").slice(0, 400);

            const rawCodeCell = $(cols[IDX.CODE]);
            let extractedCodes = [];

            rawCodeCell.find('code').each((__, el) => {
                const txt = $(el).text().trim();
                if (txt.length >= 4 && /^[A-Za-z0-9]+$/.test(txt)) extractedCodes.push(txt);
            });

            if (extractedCodes.length === 0) {
                rawCodeCell.find('a[href*="gift?code="]').each((__, el) => {
                    const match = $(el).attr('href')?.match(/code=([A-Za-z0-9]+)/);
                    if (match?.[1]) extractedCodes.push(match[1]);
                });
            }

            if (extractedCodes.length === 0) {
                const txt = rawCodeCell.text().trim().split(/\s+/)[0];
                if (txt && /^[A-Za-z0-9]+$/.test(txt) && txt.length >= 4) extractedCodes.push(txt);
            }

            extractedCodes.forEach(codeStr => {
                const redeemLink = `https://genshin.hoyoverse.com/gift?code=${codeStr}`;
                codes.push({
                    postId: `wiki_${codeStr}`,
                    title: `💎 Giftcode: ${codeStr}`,
                    code: codeStr,
                    description: `🎁 **Rewards:** ${rewards}\n\n👉 [Click to Redeem](${redeemLink})`,
                    link: redeemLink,
                    imageUrl: "https://static.wikia.nocookie.net/gensin-impact/images/d/d4/Item_Primogem.png",
                    server,
                    rewards,
                    validUntil,
                    discoveredAt
                });
            });
        });

        return codes;

    } catch (err) {
        console.error("❌ [GiftCode] Error scraping Wiki (Puppeteer):", err.message);
        return [];
    } finally {
        if (browser) await browser.close();
    }
}

async function distributeCodes(client) {
    try {
        const channels = await NewsChannel.find({ type: SCRAPER_CONFIG.type });
        if (!channels.length) return;

        const items = await fetchActiveCodes();
        if (items.length === 0) return;

        for (const item of items.reverse()) {
            for (const channelConfig of channels) {
                try {
                    const channelId = channelConfig.channelId;
                    const alreadyPosted = await PostedCodes.findOne({ code: item.code, channelId });
                    if (alreadyPosted) continue;

                    const channel = await client.channels.fetch(channelId).catch(() => null);
                    if (!channel) continue;

                    const embed = new EmbedBuilder()
                        .setColor("#2ecc71")
                        .setAuthor({ name: "New Gift Code Discovered!", iconURL: "https://i.ibb.co/GfbZk2jS/image.png" })
                        .setTitle(`${item.code}`)
                        .setURL(item.link)
                        .setDescription(item.description)
                        .setThumbnail(item.imageUrl)
                        .addFields(
                            { name: "Copy Code", value: `\`${item.code}\``, inline: true },
                            { name: "Released", value: formatDate(item.discoveredAt), inline: true },
                            { name: "Expires", value: formatDate(item.validUntil), inline: true }
                        )
                        .setFooter({ text: "Created by Dang Minh Tai" })
                        .setTimestamp();

                    await channel.send({ embeds: [embed] });

                    await PostedCodes.create({
                        postId: item.postId,
                        channelId,
                        code: item.code,
                        postedAt: new Date(),
                        discoveredAt: item.discoveredAt,
                        validUntil: item.validUntil ?? null,
                        server: item.server ?? null,
                        rewards: item.rewards ?? null
                    });

                    console.log(`📢 [GiftCode] Sent ${item.code} to channel ${channelId}`);
                    await new Promise(resolve => setTimeout(resolve, 2000));

                } catch (innerErr) {
                    console.error(`❌ [GiftCode] Failed to send to channel ${channelConfig.channelId}:`, innerErr.message);
                }
            }
        }
    } catch (err) {
        console.error("❌ [GiftCode] Main distribution loop error:", err.message);
    }
}

function startGiftcodePoster(client) {
    distributeCodes(client);
    setInterval(() => distributeCodes(client), SCRAPER_CONFIG.interval);
    console.log("✅ [GiftCode] Wiki Scraper service started (Puppeteer Mode).");
}

export { startGiftcodePoster };
export default { startGiftcodePoster };