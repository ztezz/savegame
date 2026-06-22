# Hướng Dẫn Triển Khai Backend Lên Hugging Face Spaces (Sử dụng Docker & Lưu trữ Bền vững)

Tài liệu này hướng dẫn chi tiết cách đóng gói và triển khai ứng dụng backend **Cloudsave Hub Backend** (Node.js/TypeScript/Express) lên **Hugging Face Spaces** sử dụng Docker SDK, đồng thời cấu hình lưu trữ dữ liệu tải lên tại thư mục `/data` để tránh bị mất file khi Space khởi động lại.

---

## 📌 Các bước chuẩn bị trước khi cấu hình
1. **Tài khoản Hugging Face**: Truy cập [huggingface.co](https://huggingface.co/) và tạo tài khoản nếu chưa có.
2. **Cơ sở dữ liệu (PostgreSQL)**: Chuẩn bị thông tin kết nối Database (ví dụ: Supabase, Neon hoặc bất kỳ dịch vụ lưu trữ Postgres nào) vì Hugging Face Spaces không tự kèm cơ sở dữ liệu trực tiếp trong container.

---

## 🛠️ Bước 1: Tạo Space mới trên Hugging Face
1. Truy cập [huggingface.co/new-space](https://huggingface.co/new-space).
2. Thiết lập cấu hình:
   - **Space name**: Nhập tên Space của bạn (Ví dụ: `cloudsave-hub-backend`).
   - **License**: Chọn `Apache 2.0` hoặc giấy phép phù hợp.
   - **SDK**: Chọn **Docker** 🐳 *(Bắt buộc phải chọn Docker)*.
   - **Docker template**: Chọn **Blank** (Không sử dụng template dựng sẵn).
   - **Space hardware**: Chọn cấu hình mong muốn (Gói miễn phí `CPU basic` là đủ để chạy ứng dụng).
   - **Privacy**: Chọn `Public` hoặc `Private` tùy ý bạn.
3. Nhấp nút **Create Space**.

---

## 💾 Bước 2: Kích hoạt Persistent Storage (Lưu trữ bền vững) để tránh mất file
Mặc định bộ nhớ trong Docker container của Hugging Face là tạm thời (ephemeral) và sẽ bị xóa khi restart. Để giữ lại các file upload trong `/data`:

1. Tại giao diện Space vừa tạo, chuyển sang tab **Settings**.
2. Cuộn xuống phần **Persistent storage**.
3. Chọn gói lưu trữ mong muốn (Hugging Face cung cấp gói miễn phí nhỏ hoặc các gói trả phí tùy theo nhu cầu lưu trữ file save game của bạn).
4. Xác nhận kích hoạt. Khi kích hoạt xong, Hugging Face sẽ tự động mount một ổ đĩa bền vững vào thư mục `/data` trong container.

---

## ⚙️ Bước 3: Cấu hình biến môi trường (Secrets / Variables)
Do dự án sử dụng các thông tin nhạy cảm, bạn **không được** commit trực tiếp chúng vào mã nguồn. Thay vào đó, hãy cấu hình trong mục Settings:

1. Cuộn đến phần **Variables and secrets** trong tab **Settings**.
2. Thêm các **Secrets** sau (Chọn **New secret**):
   - `DATABASE_URL`: Đường dẫn kết nối tới database PostgreSQL của bạn (Ví dụ: `postgresql://user:password@host:5432/dbname`).
   - `JWT_SECRET`: Chuỗi khóa bảo mật để mã hóa token đăng nhập (Nhập một chuỗi ký tự ngẫu nhiên, dài và khó đoán).
   - `FRONTEND_ORIGIN`: Danh sách domain của frontend được phép truy cập API (Ví dụ: `https://luugame.fun` hoặc `*` để cho phép tất cả các nguồn).
   - `NODE_ENV`: Đặt giá trị là `production`.
   - `PORT`: Đặt giá trị là `7860`.
   - `UPLOADS_DIR`: Đặt giá trị là `/data` (Dockerfile đã cấu hình mặc định biến này, nhưng bạn có thể đặt tường minh ở đây nếu muốn).

---

## 📦 Bước 4: Đưa file Dockerfile vào dự án backend
Hãy chắc chắn rằng hai file sau nằm ở **thư mục gốc của dự án backend** trước khi push code lên Hugging Face:
1. File [Dockerfile](file:///D:/code/savegame/Dockerfile) (Đã được cập nhật để ghi nhận lưu trữ file vào `/data` và cấp quyền cho user `node`).
2. File [.dockerignore](file:///D:/code/savegame/.dockerignore) (Để tối ưu và tránh tải các file không cần thiết lên docker image).

> 💡 **Mẹo:** Bạn hãy di chuyển 2 file này vào thư mục `backend` của bạn nếu mã nguồn đang được phân chia thành nhiều thư mục riêng biệt.

---

## 🚀 Bước 5: Đẩy mã nguồn lên Hugging Face Spaces
Bạn có thể đẩy code lên qua Git. Tại trang chính của Space, bạn sẽ thấy hướng dẫn chi tiết của Hugging Face. Cách thực hiện cơ bản như sau:

1. Mở terminal tại thư mục backend của bạn.
2. Khởi tạo Git (nếu chưa khởi tạo):
   ```bash
   git init
   git branch -M main
   ```
3. Thêm repository của Hugging Face Space làm remote:
   ```bash
   git remote add hf https://huggingface.co/spaces/<TÊN_USER_CỦA_BẠN>/<TÊN_SPACE_CỦA_BẠN>
   ```
4. Commit và push code lên:
   ```bash
   git add .
   git commit -m "Deploy backend to Hugging Face Spaces with persistent storage"
   git push -f hf main
   ```

*Hugging Face sẽ tự động kích hoạt tiến trình build Docker Image dựa trên file `Dockerfile` bạn cung cấp và khởi chạy ứng dụng.*

---

## 🛡️ Điểm kỹ thuật đáng chú ý trong Dockerfile mới
* **User bảo mật**: Dockerfile sử dụng user mặc định `node` (UID `1000`) thay vì chạy quyền `root`. Đây là yêu cầu tiêu chuẩn của Hugging Face Spaces để đảm bảo an toàn.
* **Cấp quyền thư mục `/data`**: Trước khi chuyển sang user `node`, Dockerfile chạy lệnh `mkdir -p /data && chown -R node:node /data` để đảm bảo user `node` có toàn quyền ghi file save game vào thư mục `/data`.
* **Biến môi trường UPLOADS_DIR**: Đường dẫn lưu file upload của hệ thống đã được chuyển hướng mặc định từ `uploads/` sang `/data` thông qua cấu hình `ENV UPLOADS_DIR=/data`.

---

## 🔗 Bước 6: Cấu hình kết nối cho Frontend
Sau khi Space triển khai thành công và chuyển sang trạng thái **Running**, bạn sẽ có một URL công khai cho backend dạng:
`https://<tên_user>-<tên_space>.hf.space`

Hãy lấy URL này và cấu hình cho frontend của bạn:
* Cập nhật file `.env` hoặc cấu hình biến môi trường của frontend:
  ```env
  VITE_API_URL=https://<tên_user>-<tên_space>.hf.space
  ```
* Tiến hành build và deploy lại Frontend lên dịch vụ host tĩnh (Cloudflare Pages, Vercel, Netlify...).
