import axios from "axios";
import { load } from "cheerio";
import { EmbedBuilder } from "discord.js";
import PostedCodes from "../models/PostedCodes.js";
import NewsChannel from "../models/NewsChannel.js";

// --- CONFIGURATION & CONSTANTS ---
const SCRAPER_CONFIG = {
    url: "https://genshin-impact.fandom.com/wiki/Promotional_Code",
    type: "giftcode",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    timeout: 30000,
    interval: 10 * 60 * 1000, // 10 minutes
    maxDiscoveredDays: 60    // Ignore codes discovered more than 60 days ago
};

// --- HELPER FUNCTIONS ---

/**
 * Formats a Date object to DD/MM/YYYY string.
 * @param {Date} date 
 * @returns {string}
 */
function formatDate(date) {
    if (!date || isNaN(date.getTime())) return "—";
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${day}/${month}/${date.getFullYear()}`;
}

/**
 * Parses the "Duration" column text from the Wiki.
 * Extracts 'Valid until' and 'Discovered' dates.
 * * @param {string} text - The raw text from the Wiki cell.
 * @returns {{ isActive: boolean, validUntil: Date|null, discoveredAt: Date|null }}
 */
function parseDuration(text) {
    if (!text || typeof text !== "string") {
        return { isActive: true, validUntil: null, discoveredAt: null };
    }

    let validUntil = null;
    let isActive = true;
    let discoveredAt = null;

    // Regex to extract dates (Format: Month DD, YYYY)
    const validMatch = text.match(/Valid until:\s*([A-Za-z]+\s+\d{1,2},\s*\d{4})/i);
    const discoveredMatch = text.match(/Discovered:\s*([A-Za-z]+\s+\d{1,2},\s*\d{4})/i);

    // Process Expiration
    if (validMatch) {
        const expiryDate = new Date(validMatch[1].trim());
        if (!isNaN(expiryDate.getTime())) {
            validUntil = expiryDate;

            // normalize to midnight for comparison
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            expiryDate.setHours(0, 0, 0, 0);

            isActive = expiryDate >= today;
        }
    }

    // Process Discovery Date
    if (discoveredMatch) {
        const discDate = new Date(discoveredMatch[1].trim());
        if (!isNaN(discDate.getTime())) {
            discoveredAt = discDate;
        }
    }

    return { isActive, validUntil, discoveredAt };
}

/**
 * Fetches and parses gift codes from the Fandom Wiki.
 * Filters out expired or too old codes based on SCRAPER_CONFIG.
 * * @returns {Promise<Array>} Array of valid code objects.
 */
async function fetchActiveCodes() {
    try {
        const response = await axios.get(SCRAPER_CONFIG.url, {
            timeout: SCRAPER_CONFIG.timeout,
            headers: { "User-Agent": SCRAPER_CONFIG.userAgent }
        });

        const $ = load(response.data);
        const codes = [];

        // Strategy: Find the "Active Codes" header, then get the immediately following table.
        // Fallback: Get the first table with class 'wikitable'.
        let table = $('#Active_Codes').parent().nextAll('table.wikitable').first();
        if (table.length === 0) {
            table = $('table.wikitable').first();
        }

        // Column indices (Wiki structure)
        const IDX = { CODE: 0, SERVER: 1, REWARDS: 2, DURATION: 3 };

        table.find('tbody tr').each((_, row) => {
            const cols = $(row).find('td');
            if (cols.length < 4) return; // Skip invalid rows

            // 1. Check Duration/Validity
            const durationText = $(cols[IDX.DURATION]).text().trim();
            const { isActive, validUntil, discoveredAt } = parseDuration(durationText);

            if (!isActive) return; // Skip expired
            if (!discoveredAt) return; // Skip if discovery date is unknown

            // 2. Logic: Date Validation
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const discDate = new Date(discoveredAt);
            discDate.setHours(0, 0, 0, 0);

            // Logic: Must have a validUntil date UNLESS it was discovered today (new release)
            if (!validUntil && discDate.getTime() !== today.getTime()) {
                return;
            }

            // Logic: Ignore codes discovered too long ago (limit backlog spam)
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - SCRAPER_CONFIG.maxDiscoveredDays);
            cutoffDate.setHours(0, 0, 0, 0);

            if (discDate < cutoffDate) return;

            // 3. Extract Data
            const server = $(cols[IDX.SERVER]).text().trim().replace(/\n/g, ", ").slice(0, 200);
            const rewards = $(cols[IDX.REWARDS]).text().trim().replace(/\n/g, ", ").slice(0, 400);

            // Extract Code String (Handle <code> tags or plain text or links)
            const rawCodeCell = $(cols[IDX.CODE]);
            let extractedCodes = [];

            // Attempt 1: <code> tags
            rawCodeCell.find('code').each((__, el) => {
                const txt = $(el).text().trim();
                if (txt.length >= 4 && /^[A-Za-z0-9]+$/.test(txt)) extractedCodes.push(txt);
            });

            // Attempt 2: Links containing "code="
            if (extractedCodes.length === 0) {
                rawCodeCell.find('a[href*="gift?code="]').each((__, el) => {
                    const match = $(el).attr('href')?.match(/code=([A-Za-z0-9]+)/);
                    if (match?.[1]) extractedCodes.push(match[1]);
                });
            }

            // Attempt 3: Plain text fallback
            if (extractedCodes.length === 0) {
                const txt = rawCodeCell.text().trim().split(/\s+/)[0]; // Take first word
                if (txt && /^[A-Za-z0-9]+$/.test(txt) && txt.length >= 4) extractedCodes.push(txt);
            }

            // 4. Push valid items
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
        console.error("❌ [GiftCode] Error scraping Wiki:", err.message);
        return [];
    }
}

/**
 * Main Logic: Fetches codes and distributes them to subscribed channels.
 * @param {object} client - The Discord Client instance.
 */
async function distributeCodes(client) {
    try {
        // 1. Get subscribed channels
        const channels = await NewsChannel.find({ type: SCRAPER_CONFIG.type });
        if (!channels.length) return;

        // 2. Fetch data
        const items = await fetchActiveCodes();
        if (items.length === 0) {
            // Optional: console.log("⚠️ [GiftCode] No codes found.");
            return;
        }

        // 3. Process items (Reverse to send oldest discovered first if multiple new ones appear)
        for (const item of items.reverse()) {
            for (const channelConfig of channels) {
                try {
                    const channelId = channelConfig.channelId;

                    // 4. Check Duplicate in DB
                    const alreadyPosted = await PostedCodes.findOne({ code: item.code, channelId });
                    if (alreadyPosted) continue;

                    // 5. Fetch Discord Channel
                    const channel = await client.channels.fetch(channelId).catch(() => null);
                    if (!channel) continue;

                    // 6. Build Embed
                    const embed = new EmbedBuilder()
                        .setColor("#2ecc71") // Green for Active
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

                    // 7. Send & Save
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

                    // Rate limit prevention (2s delay)
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

/**
 * Starts the interval loop for the Gift Code Poster.
 * @param {object} client - The Discord Client instance.
 */
function startGiftcodePoster(client) {
    // Initial run
    distributeCodes(client);

    // Schedule interval
    setInterval(() => distributeCodes(client), SCRAPER_CONFIG.interval);

    console.log("✅ [GiftCode] Wiki Scraper service started.");
}

export { startGiftcodePoster };
export default { startGiftcodePoster };