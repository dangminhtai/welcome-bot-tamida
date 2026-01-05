const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const sharp = require('sharp');

// CẤU HÌNH CÁC "KHO" ẢNH (SUBREDDITS)
const SUBREDDIT_MAP = {
    'dog': ['dogpictures', 'puppies', 'shiba', 'corgi', 'husky', 'dogs'],
    'cat': ['cats', 'kitten', 'catpictures', 'SupermodelCats', 'catmemes'],
    'rabbit': ['Rabbits', 'Bunnies', 'rabbitsofreddit'],
    'fox': ['foxes', 'yayfoxxo', 'TrashPandas'],
    'squirrel': ['squirrels', 'squirrelsEatingPizza'],
    'bird': ['birding', 'wildlifephotography', 'Owls', 'birdpics'],
    'all': ['AnimalsBeingDerps', 'WhatsWrongWithYourDog', 'horses', 'Equestrian',
        'bears', 'BearGifs', 'wildlifephotography', 'NatureIsFuckingLit', 'nature', 'ALLTHEANIMALS',
        'aww', 'eyebleach', 'RarePuppers', 'AnimalsBeingDerps'
    ]
};

/**
 * Hàm lấy 1 bài viết ngẫu nhiên từ danh sách Subreddit
 */
async function getRedditPost(topic) {
    const subList = SUBREDDIT_MAP[topic] || SUBREDDIT_MAP['all'];
    const randomSub = subList[Math.floor(Math.random() * subList.length)];
    const url = `https://www.reddit.com/r/${randomSub}/hot.json?limit=50`;

    try {
        const res = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        const posts = res.data.data.children;
        const validPosts = posts.filter(post => {
            const data = post.data;
            return !data.is_video &&
                !data.over_18 &&
                data.url &&
                (data.url.endsWith('.jpg') ||
                    data.url.endsWith('.jpeg') ||
                    data.url.endsWith('.png'));
        });

        if (validPosts.length === 0) throw new Error('Không tìm thấy ảnh hợp lệ');

        const randomPost = validPosts[Math.floor(Math.random() * validPosts.length)].data;

        return {
            imageUrl: randomPost.url,
            title: randomPost.title,
            author: randomPost.author,
            subreddit: randomSub,
            upvotes: randomPost.ups,
            permalink: `https://reddit.com${randomPost.permalink}`
        };

    } catch (error) {
        console.error(`Lỗi lấy ảnh từ r/${randomSub}:`, error.message);
        return null;
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('animal')
        .setDescription('Xem ảnh động vật ngẫu nhiên')
        .setIntegrationTypes([0, 1]) // GuildInstall, UserInstall
        .setContexts([0, 1, 2]) // Guild, BotDM, PrivateChannel
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Chọn loại muốn xem')
                .setRequired(false)
                .addChoices(
                    { name: 'Tất cả', value: 'all' },
                    { name: 'Chó', value: 'dog' },
                    { name: 'Mèo', value: 'cat' },
                    { name: 'Thỏ', value: 'rabbit' },
                    { name: 'Cáo', value: 'fox' },
                    { name: 'Chim', value: 'bird' },
                    { name: 'Sóc', value: 'squirrel' }
                )
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const type = interaction.options.getString('type') || 'cute';

        let redditData = null;
        for (let i = 0; i < 3; i++) {
            redditData = await getRedditPost(type);
            if (redditData) break;
        }

        if (!redditData) {
            return await interaction.editReply('Mạng thằng Admin bị lỗi, vui lòng chờ nó nạp 4G');
        }

        try {
            const imageResponse = await axios.get(redditData.imageUrl, {
                responseType: 'arraybuffer',
                timeout: 10000
            });

            const imageBuffer = Buffer.from(imageResponse.data);
            const image = sharp(imageBuffer);
            const metadata = await image.metadata();

            const targetRatio = 1.5;
            let cropWidth = metadata.width;
            let cropHeight = Math.floor(cropWidth / targetRatio);

            if (cropHeight > metadata.height) {
                cropHeight = metadata.height;
                cropWidth = Math.floor(cropHeight * targetRatio);
            }

            const left = Math.floor((metadata.width - cropWidth) / 2);
            const top = Math.floor((metadata.height - cropHeight) / 2);

            const processedBuffer = await image
                .extract({ left, top, width: cropWidth, height: cropHeight })
                .resize({ width: 800 })
                .toFormat('jpeg')
                .jpeg({ quality: 85, mozjpeg: true })
                .toBuffer();

            const fileName = `haruna-animal-${type}-${Date.now()}.jpg`;
            const attachment = new AttachmentBuilder(processedBuffer, { name: fileName });

            const embed = new EmbedBuilder()
                .setColor('#FF4500')
                .setTitle(redditData.title.length > 256 ? redditData.title.substring(0, 253) + '...' : redditData.title)
                .setURL(redditData.permalink)
                .setImage(`attachment://${fileName}`)
                .setFooter({
                    text: `Được yêu cầu bởi ${interaction.user.username}`,
                    iconURL: interaction.user.displayAvatarURL({ dynamic: true })
                })
                .setTimestamp();

            await interaction.editReply({
                embeds: [embed],
                files: [attachment]
            });

        } catch (error) {
            console.error("Lỗi xử lý ảnh:", error);
            await interaction.editReply({
                content: `Lỗi 1 chút khi cố gắng lấy ảnh.`
            });
        }
    },
};