# Requirements Document: Tính năng Tìm kiếm Lời bài hát (Lyrics Search)

## 1. Tổng quan
Tạo một lệnh cho Discord Bot cho phép người dùng tìm kiếm thông tin chính xác về bài hát (Tên bài hát, Nghệ sĩ, Lời bài hát đầy đủ) chỉ dựa trên một đoạn lời (lyrics snippet) mà họ cung cấp. Tính năng này sẽ sử dụng sức mạnh của **Google Gemini AI** kết hợp với **Grounding with Google Search** để đảm bảo kết quả tìm kiếm là mới nhất và chính xác nhất.

## 2. Yêu cầu chức năng
- **Tên lệnh:** `/lyrics` (Slash Command).
- **Tham số đầu vào:** 
    - `query` (String, Required): Đoạn lời bài hát hoặc câu hát mà người dùng nhớ được.
- **Quy trình xử lý:**
    1. Nhận đoạn text từ người dùng.
    2. Gửi request đến model `gemini-3-flash-preview` (hoặc phiên bản mới nhất hỗ trợ Grounding).
    3. Sử dụng công cụ `googleSearch` để tìm kiếm thông tin bài hát trên mạng.
    4. Trích xuất thông tin: Tên bài hát, Tên ca sĩ/nhạc sĩ, và Lời bài hát đầy đủ.
    5. Trả về kết quả dưới dạng Embed đẹp mắt trên Discord.
- **Xử lý lỗi:**
    - Nếu không tìm thấy: Thông báo cho người dùng một cách lịch sự.
    - Nếu API lỗi: Thông báo hệ thống đang bận.

## 3. Yêu cầu kỹ thuật
Sử dụng thư viện `@google/genai` với cấu hình Grounding.

### Mẫu cấu hình AI:
```javascript
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: }); // Thêm khóa API

const groundingTool = {
  googleSearch: {},
};

const config = {
  tools: [groundingTool],
};

// Logic gọi nội dung
async function findLyrics(snippet) {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: `Tìm tên bài hát, nghệ sĩ và lời đầy đủ cho đoạn lyrics này: "${snippet}"`,
      config,
    });
    
    return response.text;
}
```

## 4. Giao diện người dùng (UI/UX)
- Kết quả trả về qua **Discord Embed**:
    - **Thumbnail:** Hình ảnh liên quan đến bài hát (nếu tìm được URL image).
    - **Title:** [Tên bài hát] - [Nghệ sĩ].
    - **Description:** Lời bài hát (nếu quá dài (>2048 ký tự) thì cắt bớt và thêm link hoặc gửi file đính kèm/nhiều trang).
    - **Color:** Màu sắc thương hiệu (ví dụ: xanh dương hoặc theo màu cover bài hát).

## 5. Kịch bản kiểm thử (Test Cases)
- **TC1:** Nhập đoạn lời bài hát nổi tiếng (ví dụ: "Sơn Tùng MTP chúng ta của sau này"). -> Kỳ vọng: Trả đúng bài "Chúng Ta Của Hiện Tại".
- **TC2:** Nhập đoạn lời bài hát sai chính tả nhẹ. -> Kỳ vọng: AI vẫn nhận diện đúng nhờ Google Search.
- **TC3:** Nhập đoạn lyrics không có thật hoặc vô nghĩa. -> Kỳ vọng: AI trả lời không tìm thấy.
