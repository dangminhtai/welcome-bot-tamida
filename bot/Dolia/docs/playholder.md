# Placeholders Documentation

File này định nghĩa các biến placeholder sẽ được thay thế bằng dữ liệu thực tế trong code trước khi gửi Prompt đến AI.

| Placeholder | Mô tả | Giá trị thay thế (Ví dụ Code) |
| :--- | :--- | :--- |
| `{{user}}` | Tên hiển thị của người dùng | `message.member.displayName` hoặc `interaction.user.globalName` |
| `{{user_id}}` | ID của người dùng | `message.member.id` |
| `{{server_name}}` | Tên của Server Discord hiện tại | `message.guild.name` |
| `{{channel_name}}` | Tên kênh hiện tại | `message.channel.name` |
| `{{time}}` | Thời gian hiện tại của hệ thống | `new Date().toLocaleString('vi-VN')` |
| `{{bot_name}}` | Tên của Bot | `client.user.username` |

**Cách sử dụng:**
Nhúng các placeholder này vào trong các file `Persona.md`, `Task.md`, `Context.md`, hoặc `Format.md`. Hệ thống sẽ tự động replace chúng trước khi xử lý.