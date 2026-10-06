# MCP "bongda" — cho Claude quản lý sổ đội bóng

MCP (Model Context Protocol) là **ổ cắm chuẩn giữa AI và phần mềm khác** — giống chuẩn IEC 61850 trong trạm:
thiết bị hãng nào cũng nói chung một ngôn ngữ. Server này là "ổ cắm" của app đội bóng: nó liệt kê các nút
(xem nợ, ghi kết quả, gạch nợ…) để Claude bấm khi anh nói chuyện bình thường. **Anh duyệt từng lần bấm nút ghi sổ.**

Mọi luật tính tiền dùng chung `src/logic.ts` với web → AI ghi hay người ghi trên web, sổ y hệt nhau.

## 22 nút

| Nhóm | Nút |
|---|---|
| Xem (an toàn) | `tong_quan` · `danh_sach_no` · `soan_tin_nhac` · `thanh_vien` · `lich_su_tran` · `chi_tiet_tran` · `so_quy` · `xem_cai_dat` · `chia_doi` (chia thử, không lưu) |
| Trận | `tao_tran` · `sua_doi_hinh` (trận chưa đá) · `ghi_ket_qua` (chốt một lần) · `xoa_tran` |
| Tiền | `gach_no` · `bo_gach_no` · `mo_quy_thang` · `ghi_thu_chi` · `xoa_thu_chi` |
| Người & cài đặt | `them_thanh_vien` · `sua_thanh_vien` · `xoa_thanh_vien` (mặc định chỉ cho tạm nghỉ) · `cai_dat` |

Rào an toàn có sẵn:
- Không bao giờ tự nghĩ ra tỉ số; tỉ số mâu thuẫn với đội thắng → từ chối, hỏi lại.
- Trận **đã chốt kết quả** (hoặc nhập từ sổ cũ) thì KHÔNG sửa được tỉ số lẫn đội hình — ghi nhầm thì `xoa_tran` rồi `tao_tran` lại (giống web).
- Cùng một ngày có 2 trận → bắt ghi mã trận, không đoán. Ngày không có thật (31/02) → từ chối.
- Xoá hẳn người **còn nợ** → KHÔNG xoá, báo số nợ, chỉ xoá khi anh đồng ý (`xac_nhan_bo_no`).
- Tên mơ hồ ("Minh" trùng 2 người) → báo để hỏi lại, không đoán.
- Chặn cứng database `(default)` (project `app-from-ai` dùng chung với edutask, ph-mix…).
- `BONGDA_READONLY=1` → chỉ còn nút xem.
- Mỗi lần ghi được chép vào `mcp/audit.log` (trên máy, không lên git).

## Cài đặt (một lần)

### 1. Tạo chìa khoá chỉ vào được database `bongda` (Google Cloud Console, ~5 phút)
1. https://console.cloud.google.com/iam-admin/serviceaccounts?project=app-from-ai → **Create service account** → tên `mcp-bongda` → **Create and continue**.
2. Role: **Cloud Datastore User** → bấm **Add IAM condition** → tab **Condition editor**, dán:
   ```
   resource.name == "projects/app-from-ai/databases/bongda"
   ```
   Title: `chi-db-bongda` → **Save** → **Done**. (Điều kiện này khoá chìa khoá trong database bongda, không đọc được dữ liệu edutask/ph-mix.)
3. Bấm vào `mcp-bongda` → **Keys** → **Add key** → **JSON** → tải về.
4. Chuyển file vào `C:\Users\Admin\.secrets\bongda-mcp.json` (tạo thư mục `.secrets` nếu chưa có). **Không để trong thư mục dự án.**

### 2. Cài thư viện cho server
```
npm ci --prefix F:\AI\bongda\mcp
```

### 3. Nối vào Claude
- **Claude Code**: mở Claude Code trong thư mục `F:\AI\bongda` → file `.mcp.json` ở gốc dự án đã khai báo sẵn → Claude hỏi cho phép server `bongda` → đồng ý.
  Chìa khoá để chỗ khác thì đặt biến môi trường `BONGDA_MCP_KEY` trỏ tới file.
- **Claude Desktop** (chat): Settings → Developer → Edit Config, thêm vào `mcpServers`:
  ```json
  "bongda": {
    "command": "node",
    "args": ["F:/AI/bongda/mcp/node_modules/tsx/dist/cli.mjs", "F:/AI/bongda/mcp/server.ts"],
    "env": { "GOOGLE_APPLICATION_CREDENTIALS": "C:/Users/Admin/.secrets/bongda-mcp.json" }
  }
  ```
  rồi khởi động lại Claude Desktop.

## Dùng trên nhiều máy — mỗi máy một khoá riêng

Đừng chép một file khoá sang nhiều máy (qua Zalo, email, USB…): lộ một nơi là phải thu hồi ở mọi nơi.
Thay vào đó, mỗi máy có **khoá riêng** của cùng service account `mcp-bongda` (tối đa 10 khoá):

1. https://console.cloud.google.com/iam-admin/serviceaccounts?project=app-from-ai → bấm `mcp-bongda` → **Keys** → **Add key** → **JSON**.
   Tải **ngay trên máy cần dùng**. Ghi lại *Key ID* + tên máy (vd. `may-co-quan`) để biết khoá nào của máy nào.
2. Chuyển file vào thư mục người dùng của máy đó, **ngoài thư mục dự án**, vd. `C:\Users\<tên-user>\.secrets\bongda-mcp.json`.
3. Trỏ server tới khoá (một lần cho mỗi máy), rồi **thoát hẳn và mở lại** Claude:
   ```
   setx BONGDA_MCP_KEY "C:\Users\<tên-user>\.secrets\bongda-mcp.json"
   ```
   (Đường dẫn mặc định trong `.mcp.json` là của máy ở nhà — máy khác phải đặt biến này.)
4. Thử: nhờ Claude gọi `tong_quan`. Thiếu/sai khoá thì nút báo rõ đường dẫn đang tìm.

Máy bị mất / không dùng nữa → vào **Keys** của `mcp-bongda`, xoá đúng Key ID của máy đó. Các máy khác vẫn chạy bình thường.

## Thử không đụng dữ liệu thật
```
firebase emulators:start --only firestore --project demo-bongda
node mcp/node_modules/tsx/dist/cli.mjs mcp/smoke.ts
```
`smoke.ts` đóng vai Claude, bấm một loạt nút trên emulator và kiểm định dạng dữ liệu.
Test logic (chạy cả trong CI): `npx vitest run` ở thư mục gốc.
