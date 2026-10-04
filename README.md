# ⚽ Quản lý đội bóng

App điện thoại cho đội bóng phong trào:

- **Chia đội** mỗi tuần: chọn người đi đá → bấm chia → ngẫu nhiên nhưng cân trình độ (sao 1–5), tách đều thủ môn. Bấm tên để đổi đội, sao chép đội hình dán Zalo.
- **Trận đấu**: lưu lịch sử, nhập tỉ số → app tự tính **đội thua mỗi người đóng tiền nước** (hoà: chia đôi / cả hai đóng / miễn — chỉnh trong Cài đặt).
- **Quỹ tháng**: mở quỹ mỗi tháng cho thành viên đang hoạt động, gạch từng người đã đóng, miễn cho ai nghỉ. Ghi khoản chi → biết số dư quỹ.
- **Tổng quan**: danh sách ai còn nợ khoản gì, bấm để gạch; **soạn sẵn tin nhắc** (cả nhóm hoặc nhắn riêng từng người) → sao chép, dán vào Zalo.
- **Thành viên**: thành tích thắng/hoà/thua, lịch sử đóng tiền từng người.

Cả đội mở link là **xem** được; chỉ thủ quỹ đăng nhập Google mới **sửa** được.

## Chạy thử trên máy (chưa cần Firebase)

```powershell
npm install
npm run dev
```

Không có file `.env` → app chạy **chế độ thử**, dữ liệu lưu trong trình duyệt của máy đó.

## Đang chạy thật

- Link: **https://bongda-npsc.web.app**
- Project Firebase `app-from-ai`, **database riêng `bongda`** (project này còn chạy edutask, ph-mix… — đừng dùng database `(default)`).
- Thủ quỹ: `vietthanh228@gmail.com` (sửa ở `firestore.rules` + `VITE_ADMIN_EMAILS` trong `.env`).

Cập nhật bản mới (chỉ đụng database `bongda` và site `bongda-npsc`):

```powershell
npm run build
firebase deploy --only "firestore,hosting:bongda-npsc"
```

Chạy thử trên máy mà không đụng dữ liệu thật: `npm run dev:demo`.

## Chuyển sổ Google Sheet cũ

```powershell
python scripts/import_sheet.py <file-tai-ve.xlsx> import/so-cu-NPSC.json
```

Script tự đối chiếu với các ô tổng trong sổ (báo KHỚP/LỆCH) và liệt kê chỗ cần xác nhận.
Sau đó: đăng nhập thủ quỹ → ⚙️ Cài đặt → "Nạp dữ liệu từ file" → chọn file `.json`.

## Kiểm thử

```powershell
npm test
```
