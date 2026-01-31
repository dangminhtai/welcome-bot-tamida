# Issue Tracking List

## [BUG001] {{vn_time}} hiển thị sai định dạng mong muốn
- **Mô tả lỗi**: Placeholder `{{vn_time}}` hiện đang hiển thị đầy đủ ngày/tháng/năm và giờ (ví dụ: `01:15:05 01/02/2026`). Người dùng chỉ muốn hiển thị giờ và phút (ví dụ: `01:15`).
- **Actions hiện tại**: Đang sử dụng `.toLocaleString("vi-VN", ...)` với đầy đủ các trường `hour`, `minute`, `second`, `day`, `month`, `year`.
- **Giải pháp đề xuất**: Chỉnh sửa logic `{{vn_time}}` trong `helpers/placeHolder.js` để sử dụng `formatTimeShort(now)` (trả về định dạng HH:mm) thay vì `formatDate(now)`.
- **Trạng thái**: ✅ Đã xử lý (Sử dụng `formatTimeShort` để lấy giờ:phút).
