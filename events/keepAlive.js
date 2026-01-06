import puppeteer from "puppeteer";
import MonitoredBot from "../models/MonitoredBot.js";
import urls from "../config/urls.js";
import mongoose from "mongoose";
async function keepAlive() {
    // Lấy danh sách bot offline (isActive = false)
    const bots = await MonitoredBot.find({ isActive: false });
    if (!bots.length) {
        console.log('✅ Tất cả bot đang active, không cần ping.');
        return;
    }
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    for (const bot of bots) {
        // tìm URL theo tên bot
        const entry = urls.find(u => u.name === bot.name);
        if (!entry)
            continue;
        try {
            console.log(`🌐 Visiting ${bot.name}...`);
            await page.goto(entry.url, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(30000); // giả lập ở lại 30 giây
            console.log(`✅ Stayed at ${bot.name} for 30s`);
        }
        catch (err) {
            console.log(`❌ ${bot.name} fail:`, err.message);
        }
    }
    await browser.close();
}
// chạy mỗi 5 phút
setInterval(keepAlive, 5 * 60 * 1000);
keepAlive();
