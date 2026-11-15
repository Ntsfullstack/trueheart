# Người xin tự chọn người tặng + trường `requirements` cho bài cho/xin

Ngày: 15/11/2026. Nguồn: yêu cầu khách 15/11 (3 mục), người dùng chốt phương án A và tên `requirements`.

## Ý định

1. **Người cho hạng Kim Cương chọn người nhận** — đã có từ 11/10 (`SELECT_REQUESTER`, migration
   `1799500000000`). Không đổi.
2. **Người xin muốn xin của ai thì xin** — trên bài Muốn Nhận (`WANTED`), khi nhiều người ngỏ ý
   tặng, chủ bài (người xin) chọn tay được người tặng **ở mọi hạng**. Hiện cổng Kim Cương đang áp
   cả cho `WANTED` (SRS v1.15.0 dòng 72) — quyết định đó được thay.
3. **Bài Muốn cho / Muốn xin có trường "điều kiện"** — chuỗi tự do do người đăng nhập, ví dụ
   "Ưu tiên sinh viên, tự đến lấy". Khác với `condition` hiện có (tình trạng món đồ: NEW/USED…).

## Mục tiêu / không làm / phản mục tiêu

- Mục tiêu: chủ bài `WANTED` dưới Kim Cương duyệt được lời tặng qua cả `accept` lẫn `batch-accept`;
  bài `OFFER`/`WANTED` tạo và sửa được `requirements`, đọc lại được ở mọi response trả `post`.
- Không làm: không đổi cổng Kim Cương cho `OFFER` (và các loại bài khác); không đổi lượt tự chọn
  sau 7 ngày (bài `WANTED` không ai chọn vẫn được hệ thống tự chọn); không lọc/tìm theo
  `requirements`; không đổi bảng quyền `SELECT_REQUESTER`.
- Phản mục tiêu: người không phải chủ bài `WANTED` chọn được người tặng; chủ bài `OFFER` dưới Kim
  Cương lách cổng qua `batch-accept`; `requirements` lọt sang bài CHARITY/CLASSIFIED/MERIT.

## Cách làm (đã chọn)

**Yêu cầu 2.** `AcceptGiftRequestUseCase` và `BatchAcceptRequestsUseCase` chỉ đọc capability
`SELECT_REQUESTER` khi `post.postType !== WANTED`. Batch-accept phải đọc bài **trước** cổng (hiện cổng
đứng trước mọi thứ); bài là dữ liệu công khai nên đọc trước không lộ gì thêm, và cổng vẫn đứng trước
các phép kiểm hình dạng lô. Kiểm chủ bài giữ nguyên (use case với `accept`, repository với batch).

**Yêu cầu 3 — các phương án đã cân nhắc:**

| Phương án | Đánh đổi |
| --- | --- |
| **A. Lưu ở `details` JSONB, khoá `requirements`** (chọn) | Đúng khuôn của `condition`/`estimatedValue`/`price` — trường riêng theo loại bài nằm trong `details`. Không migration, không đụng seed; tự có ở mọi response trả `post` (`post.details.requirements`). Không lọc SQL được — không cần. |
| B. Cột mới `posts.requirements varchar(500)` | Có kiểu, truy vấn được, nhưng lệch khuôn hiện có, thêm migration + entity + seed + inventory. |

Chọn A vì nó theo đúng cách repo lưu trường riêng của từng loại bài, và không có nhu cầu truy vấn.

Chi tiết A:
- Body: `post.requirements?: string | null` ở `POST /posts` và `PATCH /posts/:postId`. Tối đa 500 ký tự.
- Chỉ nhận cho `OFFER` và `WANTED`; loại khác gửi lên → 400 `VALIDATION_FAILED`
  ("requirements chỉ áp dụng cho bài OFFER và WANTED"), cùng kiểu với `condition`/`price`.
- Chuẩn hoá: cắt khoảng trắng; chuỗi rỗng sau khi cắt = `null`.
- Tạo bài `OFFER`/`WANTED`: luôn ghi khoá `details.requirements` (giá trị hoặc `null`), theo quy ước
  "khoá vắng mặt không nói được là chưa khai hay dữ liệu cũ".
- Sửa bài: bỏ trống = giữ nguyên; `null` hoặc chuỗi trắng = xoá.
- Response: `post.details.requirements` (string | null; bài cũ có thể vắng khoá).

## Ràng buộc

- Test thật trước code (TDD), chạy đủ `core` test + `lint:check` + `format:check`.
- Sửa `core-lib` thì build lại trước khi test `core`.
- Cập nhật tài liệu: SRS dòng 72, `docs/API.md` (mục chọn tay ~dòng 740 và body tạo/sửa bài),
  `docs/FEATURES.md` (~dòng 1001).
- Làm trên nhánh mới tách từ `feat/gift-request-quantity` (code duyệt yêu cầu ở đó đã khác `main`).

## Để người làm tự quyết

Câu chữ mô tả Swagger, tên test, vị trí helper chuẩn hoá chuỗi.
