
📋 Danh Sách & Phân Tích Lỗi (Issue Log)

1. Lỗi Wiki Scraper (GiftCode) - ✅ Đã sửa
Lỗi: [GiftCode] Error scraping Wiki: Request failed with status code 403
Vị trí: helpers/giftcodePoster.js
Trạng thái: ✅ Đã chuyển sang dùng thư viện Puppeteer.
Nguyên nhân gốc rễ: Trang Fandom.com chặn request từ axios (403 Forbidden).
Giải pháp đã áp dụng: Đã viết lại `fetchActiveCodes` sử dụng Puppeteer để giả lập trình duyệt thật, bypass qua lớp bảo vệ của Fandom.

2. Lỗi Button Welcome (Sai đường dẫn) - ✅ Đã sửa
Lỗi: Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/models/WelcomeMessage.js'
Vị trí: events/interactionCreate.js (dòng 19).
Trạng thái: ✅ Đã sửa đường dẫn import.
Nguyên nhân gốc rễ: Khai báo đường dẫn tương đối sai (`../../models` thay vì `../models`).
Giải pháp đã áp dụng: Đã sửa lại thành `import('../models/WelcomeMessage.js')`.

3. Lỗi Lavalink (Youtube chặn IP) - ⚠️ Cần hành động từ User
Lỗi: TrackExceptionEvent ... java.lang.RuntimeException: Not success status code: 403
Vị trí: Lavalink Node (Server Lavalink).
Trạng thái: ⚠️ Lỗi do phía YouTube chặn IP của Node công cộng.
Giải pháp:
- Dùng lệnh `/switch-provider` để chuyển sang nguồn nhạc khác (như SoundCloud) nếu YouTube bị lỗi.
- Đổi Node Lavalink khác (User cần tìm node mới và update config).

