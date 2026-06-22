# ==========================================
# STAGE 1: Build mã nguồn TypeScript
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Sao chép package.json và package-lock.json để cài đặt dependencies
COPY package*.json tsconfig.json ./

# Cài đặt toàn bộ dependencies bao gồm cả devDependencies (để build TS)
RUN npm install

# Sao chép toàn bộ mã nguồn của backend vào container
COPY . .

# Biên dịch TypeScript sang JavaScript (đầu ra sẽ nằm trong thư mục dist)
RUN npm run build

# ==========================================
# STAGE 2: Chạy ứng dụng trong môi trường Production
# ==========================================
FROM node:20-alpine

WORKDIR /app

# Tạo thư mục /data và cấp quyền cho user node (UID 1000)
# Đây là thư mục gắn Persistent Storage trên Hugging Face Spaces để tránh mất dữ liệu
RUN mkdir -p /data && chown -R node:node /data

# Sao chép file cấu hình package để chạy ứng dụng
COPY package*.json ./

# Chỉ cài đặt các dependencies cần thiết cho runtime (giúp giảm dung lượng image)
RUN npm install --only=production

# Sao chép mã nguồn đã build từ Stage 1 và phân quyền cho node user
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/server.js ./
COPY --from=builder --chown=node:node /app/schema.sql* ./

# Cấp quyền sở hữu thư mục /app cho user node
RUN chown -R node:node /app

# Chuyển sang user node (UID 1000) để bảo mật và tuân thủ yêu cầu của Hugging Face
USER node

# Cấu hình các biến môi trường cho môi trường chạy
# UPLOADS_DIR chỉ định lưu file upload vào thư mục /data (Persistent Storage)
ENV PORT=7860
ENV NODE_ENV=production
ENV UPLOADS_DIR=/data

# Mở cổng 7860 trong container
EXPOSE 7860

# Khởi chạy server backend
CMD ["npm", "start"]
