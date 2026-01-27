### 1 Không được viết code trong file hướng dẫn (.md), hướng dẫn sao cho mọi người không biết code cũng phải hiểu, các file như requirement.md hay

### 2 Luôn **self-test** (tự kiểm tra) khi làm xong một function nhỏ trong checklist
Trước khi đánh dấu tick hay commit: chạy bot, thử đúng thao tác mà người dùng sẽ làm (gọi lệnh, bấm nút, v.v.), và thử vài trường hợp lỗi (quyền thiếu, dữ liệu không tồn tại). Chỉ khi tự mình kiểm tra thấy đúng mới coi là xong. Xem gợi ý self-test trong **checklist.md** (mục **Self-test**). Ở mỗi bước trong checklist có thể có thư mục **test/** (vd. `test/b-giftcode/`) chứa script để **người làm (dev/agent) tự chạy** khi hoàn thành function — **không phải** để người dùng chạy thủ công; chạy script đó là một phần self-test.

### 3 Luôn commit trên github mỗi khi hoàn thành task
```
bash 
cd "f:\X-FILE\Code_UNI\Node JS\bot discord\Tamida";
git add <somefile>
git commit -m <name of commit>
git push

```

### 4 Kiểm tra **server (guild)** và **tham số lệnh (role, user, kênh…)** trước khi dùng
Lệnh slash có thể bị gọi trong **tin nhắn riêng (DM)** — khi đó không có server, không có role. Hoặc tham số (role, user, kênh) có thể **không có** (null) trong một số tình huống. Nếu cứ dùng luôn (ví dụ: lấy **server.id** hay **role.id**) mà chưa kiểm tra thì dễ bị lỗi **"Cannot read properties of null (reading 'id')"** và bot crash. Cần **kiểm tra** server và từng tham số cần thiết: nếu thiếu thì trả lời tin lỗi (ephemeral) rồi dừng, không gọi tiếp.

### 5 Khi **bắt lỗi** rồi trả lời interaction (reply / followUp): cẩn thận lỗi **Unknown interaction**
Interaction của Discord **chỉ còn hiệu lực vài giây**. Nếu lệnh ném lỗi trước, rồi trong đoạn **bắt lỗi** mới gửi reply hoặc followUp, có khi interaction đã **hết hạn** — Discord trả **Unknown interaction** và việc reply/followUp lại ném lỗi, dẫn tới crash. Cần **bọc** phần reply/followUp trong bắt lỗi bằng try/catch (hoặc .catch): khi gửi thất bại vì Unknown interaction thì **bỏ qua**, không ném tiếp, để bot không tắt.