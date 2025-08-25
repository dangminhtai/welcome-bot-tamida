
const axios = require("axios");
const { EmbedBuilder, AttachmentBuilder } = require("discord.js");
const PostedNews = require("./models/PostedNews");

const MAX_IMAGES = 4;
const REQUEST_TIMEOUT = 20000;

const FEEDS = [
  {
    url: "https://bbs-api-os.hoyolab.com/community/post/wapi/userPost?size=1&uid=1015537",
    channelId: "1406506009631002756" // genshin-hoyolab
  }
];

// Làm sạch text mô tả
function cleanText(text) {
  if (!text) return "";
  return text.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

// Bóc toàn bộ URL ảnh từ HTML + structured_content (JSON string)
function extractAllImageUrls(postObj) {
  const urls = new Set();

  const cover = postObj.post.cover;
  if (cover) urls.add(cover);

  const html = postObj.post.content || "";
  const structured = typeof postObj.post.structured_content === "string"
    ? postObj.post.structured_content
    : JSON.stringify(postObj.post.structured_content || "");

  // <img src="...">
  for (const m of html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) {
    urls.add(m[1]);
  }

  // Bắt mọi URL ảnh đuôi png/jpg/jpeg/gif/webp trong structured_content
  const IMG_URL_RE = /(https?:\/\/[^\s"'<>\\)]+?\.(?:png|jpe?g|gif|webp))(?:\?[^\s"'<>\\)]*)?/gi;
  for (const m of structured.matchAll(IMG_URL_RE)) {
    urls.add(m[1]);
  }

  // Một số bài có trường image_list
  const list1 = postObj.image_list || postObj.post.image_list;
  if (Array.isArray(list1)) {
    for (const it of list1) {
      if (typeof it === "string") urls.add(it);
      else if (it && typeof it.url === "string") urls.add(it.url);
    }
  }

  return [...urls].slice(0, MAX_IMAGES); // trả về tối đa MAX_IMAGES
}

// Tải ảnh thành AttachmentBuilder (tối đa MAX_IMAGES ảnh/1 message)
async function downloadAttachments(urls, id) {
  const atts = [];
  const limit = Math.min(urls.length, MAX_IMAGES);
  for (let i = 0; i < limit; i++) {
    const url = urls[i];
    try {
      const res = await axios.get(url, { responseType: "arraybuffer", timeout: REQUEST_TIMEOUT });
      const ext = (url.split("?")[0].match(/\.(png|jpe?g|gif|webp)$/i) || [, "png"])[1];
      const name = `hoyo_${id}_${i}.${ext}`;
      const file = new AttachmentBuilder(Buffer.from(res.data), { name });
      atts.push(file);
    //   console.log(`[DEBUG] Downloaded image ${i+1}/${limit} for post ${id}: ${url}`);
    } catch (e) {
      console.warn(`[DEBUG] Failed to download image for post ${id}: ${url} -> ${e.message}`);
    }
  }
  return atts;
}

async function checkNews(client) {
  for (const feedInfo of FEEDS) {
    try {
      const response = await axios.get(feedInfo.url, { timeout: REQUEST_TIMEOUT });
      const list = response?.data?.data?.list || [];
    //   console.log(`[DEBUG] API returned ${list.length} posts`);

      for (const post of list.reverse()) {
        const id = post.post.post_id;
        const link = `https://www.hoyolab.com/article/${id}`;

        const exists = await PostedNews.findOne({ postId: id });
        if (exists) {
          // console.log(`[DEBUG] Skipped already posted: ${id}`);
          continue;
        }

        // Thu ảnh (tối đa MAX_IMAGES)
        const imageUrls = extractAllImageUrls(post);
        // console.log(`[DEBUG] Post ${id} imageUrls:`, imageUrls);

        // Tải attachments
        const attachments = await downloadAttachments(imageUrls, id);

        const channel = await client.channels.fetch(feedInfo.channelId);
        if (!channel) {
          console.warn(`[WARN] Channel not found: ${feedInfo.channelId}`);
          continue;
        }

        // Tạo embed chính
        const mainEmbed = new EmbedBuilder()
          .setColor("#0099ff")
          .setAuthor({
            name: "Genshin Impact Official",
            iconURL: "https://i.ibb.co/GfbZk2jS/image.png"
          })
          .setTitle(post.post.subject || "New post")
          .setURL(link)
          .setDescription(cleanText(post.post.content)?.slice(0, 1000) + `\n\n **View detail:** ${link}`)
          .setTimestamp(new Date(post.post.created_at * 1000))
          .setFooter({ text: "Follow on HoYoLAB for full details" });

        // Nếu có ảnh, embed chính lấy ảnh đầu tiên (dùng attachment://)
        if (attachments.length > 0) {
          mainEmbed.setImage(`attachment://${attachments[0].name}`);
        }

        // Tạo các embed phụ chứa ảnh (attachments[1..])
        const imageEmbeds = [];
        for (let i = 1; i < attachments.length; i++) {
          imageEmbeds.push(
            new EmbedBuilder()
              .setColor("#0099ff")
              .setImage(`attachment://${attachments[i].name}`)
              .setURL(link) // giữ cùng URL nếu muốn
          );
        }

        // Gửi 1 tin nhắn duy nhất: nhiều embed (main + imageEmbeds) + files (attachments)
        try {
          const sent = await channel.send({
            embeds: [mainEmbed, ...imageEmbeds],
            files: attachments
          });

          // Lưu DB sau khi gửi thành công
          await PostedNews.create({ postId: id });
          console.log(`📢 Posted news ${id} with ${attachments.length} images: ${link}`);
        } catch (sendErr) {
          console.error(`❌ Failed to send post ${id}:`, sendErr);
        }
      }
    } catch (err) {
      console.error("❌ Error fetching news:", err.message);
    }
  }
}

function startNewsPoster(client) {
  checkNews(client);
  setInterval(() => checkNews(client), 5 * 60 * 1000);
}

module.exports = { startNewsPoster };
