# Bài học kinh nghiệm

- Nội dung file hướng dẫn/tài liệu phải hoàn toàn bằng tiếng Việt để dễ hiểu và thống nhất.
- Sau khi chốt file requirements, cần lập ngay file `check_lists.md` để liệt kê chi tiết các công việc cần làm để hoàn thành kế hoạch.
- Bot tự viết code, tự kiểm tra và tự đánh dấu checklist. User chỉ đóng vai trò Reviewer và chạy server.
- File test phải nằm trong thư mục `test` riêng biệt để tránh lộn xộn. Code bắt buộc sử dụng chuẩn ESM (import/export), không dùng CommonJS.
- Trong file checklist, cần phân chia các yêu cầu theo mã định danh (ví dụ: REQ001, REQ002...) để dễ dàng quản lý và mở rộng sau này.
- Bot con không cần cài node_modules vì nó sử dụng thư viện của bot cha.
- Đối với những tác vụ liên quan đến CRUD, ghi log, hoặc quản lý dữ liệu người dùng, cần sử dụng Database thay vì lưu trong file JSON hoặc RAM. File JSON chỉ nên dùng cho các cấu hình tĩnh hoặc danh sách chuỗi cố định.
- Check-lists không phải là cố định, chúng có thể và cần được điều chỉnh linh hoạt theo yêu cầu và phản hồi của người dùng trong quá trình phát triển.
- Mỗi khi có yêu cầu mới hoặc thay đổi hướng đi, bot cần tự giác cập nhật hoặc tạo mới các file `requirements.md` và `check_lists.md` để đảm bảo quy trình làm việc minh bạch và có hệ thống.
- Cần duy trì file `issue_lists.md` để theo dõi và quản lý lỗi (BUG001, BUG002...). Mỗi lỗi cần mô tả rõ: mô tả lỗi, các action/giải pháp đã thử nhưng thất bại, và giải pháp cuối cùng được áp dụng. Tuyệt đối không thử lại các giải pháp đã thất bại.
- Khi người dùng yêu cầu "push lên git", thực hiện các lệnh: `git add <file>`, `git commit -m "<mô tả>"`, và `git push`. Đây là quy trình chuẩn để cập nhật code lên repository.
