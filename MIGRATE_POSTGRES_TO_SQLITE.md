# Migrate PostgreSQL To SQLite

Script `scripts/migrate-postgres-to-sqlite.ts` chuyển dữ liệu từ PostgreSQL/Supabase sang SQLite.

## Chuẩn bị

1. Dừng backend để file SQLite đích không bị mở trong lúc thay thế.
2. Backup PostgreSQL và thư mục upload hiện tại.
3. Cấu hình nguồn trong `.env`:

```env
SOURCE_DATABASE_URL="postgresql://user:password@host:5432/database"
SOURCE_DB_SSL=true
DATABASE_PATH="data/savegame.sqlite"
```

Với Supabase pooler, dùng connection string đầy đủ lấy từ Supabase Dashboard. Nếu PostgreSQL local không dùng SSL, đặt `SOURCE_DB_SSL=false`.

## Chạy migration

Nếu file SQLite đích chưa tồn tại:

```bash
npm run db:migrate:postgres
```

Nếu `data/savegame.sqlite` đã tồn tại:

```bash
npm run db:migrate:postgres -- --force
```

Khi dùng `--force`, script đổi tên database SQLite hiện tại thành file dạng:

```text
data/savegame.sqlite.backup-YYYY-MM-DDTHH-MM-SS
```

Database mới được tạo ở file tạm, chỉ thay file đích sau khi tất cả bước sau thành công:

- Import các bảng tồn tại trong PostgreSQL theo thứ tự khóa ngoại.
- So sánh số bản ghi nguồn và đích cho từng bảng.
- Chạy `PRAGMA foreign_key_check`.
- Chạy `PRAGMA integrity_check`.

Các bảng không tồn tại trong schema PostgreSQL cũ được bỏ qua. Các cột PostgreSQL cũ không còn trong SQLite cũng được bỏ qua; cột mới của SQLite dùng giá trị mặc định.

## Sau migration

1. Giữ nguyên thư mục upload cũ vì database chỉ chứa đường dẫn file.
2. Khởi động backend và đăng nhập bằng tài khoản cũ.
3. Kiểm tra Save Library, Drive, thiết bị, settings và community chat.
4. Chỉ xóa database backup sau khi đã xác nhận dữ liệu đầy đủ.

Có thể kiểm tra integrity, foreign keys và số bản ghi bằng:

```bash
npm run db:verify
```
