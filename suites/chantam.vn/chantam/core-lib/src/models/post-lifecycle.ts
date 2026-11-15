import { PostTypes } from '../consts';

/**
 * Bài đăng sống 3 tháng kể từ lúc được duyệt (CHỐT-05, CHỐT-07).
 *
 * **KHÔNG áp cho `OFFER`/`WANTED` nữa** — CHỐT-10 cho `OFFER` vòng đời 7 + 30 ngày, và từ
 * 16/11 `WANTED` sống `availableDay` ngày (1–30, mặc định 30). Dùng `postExpiryDateFor` thay vì gọi `postExpiryDate` trực tiếp.
 */
export const PostLifetimeMonths = 3;

/**
 * Giai đoạn xét ứng viên, tính từ **lúc đăng** (CHỐT-10).
 *
 * Mốc này trước 07/10 bắt đầu từ **phản hồi đầu tiên**, nên một bài không ai xin
 * thì `selection_deadline` là `null` vĩnh viễn — nó không bao giờ tới hạn, không
 * bao giờ vào giai đoạn mở rộng, và chỉ chết ở mốc ba tháng. Đếm từ lúc đăng thì
 * bài không có phản hồi nào cũng có hạn.
 */
export const SelectionWindowDays = 7;

/**
 * Giai đoạn mở rộng, TỰ ĐỘNG khi hết hạn xét mà chưa ghép được ai (CHỐT-10).
 *
 * Đây là thứ thay thế chế độ `EXTENDED` cũ: không còn ai chọn nó, mọi bài `OFFER` chưa
 * ghép được đều được thêm khoảng này. Bài `WANTED` KHÔNG có giai đoạn này từ 16/11 —
 * xem `wantedLifecycleDates`. Trong khoảng đó bài **vẫn nhận phản hồi**
 * và vẫn áp cơ chế ghép — nó không phải một giai đoạn chờ chết.
 */
export const ExtensionWindowDays = 30;

/**
 * Bài đi theo vòng đời 7 + 30 ngày thay vì 3 tháng (CHỐT-10).
 *
 * Tách thành một hàm có tên chứ không rải `=== OFFER` khắp nơi: hiện có ba chỗ
 * phải trả lời câu này (đặt hạn lúc đăng, hạn dự phòng lúc kiểm duyệt, và vòng
 * quét hết hạn), và ba chỗ tự nhớ một nửa quy định là cách CHỐT-05 từng bị hiểu
 * lệch.
 *
 * ## `WANTED` vào đây từ 11/10, SAU khi đảo vai
 *
 * Thứ tự này là cả nội dung của lượt sửa. Bản trước cố ý để `WANTED` ngoài, vì
 * bật nó khi đó sẽ hỏng dữ liệu — đo được:
 *
 * - truy vấn tìm bài tới hạn trong `gift-request.repository` **không lọc
 *   `post_type`**, nên hễ `selection_deadline` có giá trị là job xét tới;
 * - và nó lấy `SELECT post.author_id AS giver_id`.
 *
 * Với bài `WANTED`, tác giả là người **muốn NHẬN**. Nên đặt hạn cho `WANTED`
 * TRƯỚC khi sửa hai chỗ đó là để job tự dựng giao dịch với hai vai ngược nhau:
 * người cần đồ thành người tặng. Hậu quả không nằm ở một bảng — điểm hoàn tất
 * trả cho người nhận đồ, bộ đếm rank tính cho sai người, `GET /transactions`
 * hiện sai vai, và phòng chat mở với nhãn sai.
 *
 * Vai nay suy từ `giftTransactionRoles`, một chỗ duy nhất, và `acceptRequest`
 * TRẢ VỀ vai đã phân giải để nơi gọi khỏi đoán lại. Nên cờ này bật được.
 *
 * Hạn xét vì thế áp cho `WANTED` từ đây. Hạn SỐNG của `WANTED` thì từ 16/11 là
 * `availableDay` ngày, không còn 37 — xem `wantedLifecycleDates`. Bài `WANTED` đăng TRƯỚC 11/10
 * giữ hạn ba tháng đã hứa — migration cho chúng một `selection_deadline` nhưng
 * KHÔNG rút `expires_at`, cùng lối như `1799300000000`.
 */
export function usesSelectionLifecycle(postType: PostTypes): boolean {
  return postType === PostTypes.OFFER || postType === PostTypes.WANTED;
}

/** Cộng ngày. Tách ra để mọi mốc của CHỐT-10 cùng đi qua một chỗ. */
export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Hạn xét ứng viên = lúc đăng + 7 ngày (CHỐT-10).
 *
 * Trả về mốc cho **mọi** chế độ, kể cả `INSTANT`. Đặc tả nói rõ: bài `INSTANT`
 * không có giai đoạn *xét ứng viên*, nhưng vẫn có mốc 7 ngày đầu, và chưa ghép
 * được ai thì cũng tự mở thêm 30 ngày. Để `null` cho `INSTANT` là làm nó thành
 * bài duy nhất không có đồng hồ nào.
 */
export function selectionDeadlineFrom(publishedAt: Date): Date {
  return addDays(publishedAt, SelectionWindowDays);
}

/**
 * Mốc hết hạn theo LOẠI bài.
 *
 * `OFFER`: 7 + 30 = **37 ngày** từ lúc đăng. `WANTED`: **30 ngày** mặc định từ 16/11 — người
 * đăng chọn được 1–30 (`availableDay`, xem `wantedLifecycleDates`), và đây là con số khi họ
 * không chọn, nên hạn dự phòng ở đường Admin và hạn của bài tạo qua API không thể lệch nhau.
 * Mọi loại khác giữ 3 tháng của CHỐT-05/CHỐT-07.
 *
 * Giai đoạn mở rộng **không cần cột trạng thái mới**: nó chính là khoảng giữa
 * `selection_deadline` và `expires_at`. Thêm một cờ `IS_EXTENDED` là thêm một
 * nguồn sự thật thứ hai cho một điều đã suy ra được từ hai cái mốc.
 */
export function postExpiryDateFor(
  postType: PostTypes,
  publishedAt: Date,
): Date {
  if (postType === PostTypes.WANTED)
    return addDays(publishedAt, DefaultWantedAvailableDays);
  return usesSelectionLifecycle(postType)
    ? addDays(publishedAt, SelectionWindowDays + ExtensionWindowDays)
    : postExpiryDate(publishedAt);
}

/** Số lần một bài được phép gia hạn (CHỐT-07). */
export const PostMaxRenewals = 1;

/**
 * Thời gian tồn tại người đăng bài `WANTED` tự chọn (16/11), tính bằng ngày từ lúc đăng.
 *
 * Thay vòng đời 7 + 30 ngày của CHỐT-10 cho riêng `WANTED`: không gửi thì 30 ngày — tức
 * bài Muốn Nhận mặc định sống 30 ngày chứ không còn 37.
 */
export const MinWantedAvailableDays = 1;
export const MaxWantedAvailableDays = 30;
export const DefaultWantedAvailableDays = 30;

/**
 * Hai mốc của bài `WANTED` theo `availableDay`.
 *
 * - `expiresAt` = lúc đăng + `availableDay` ngày. KHÔNG còn 30 ngày tự mở thêm — người đăng
 *   đã nói bài sống bao lâu.
 * - `selectionDeadline` = lúc đăng + `min(7, availableDay − 1)` ngày: luôn sớm hơn `expiresAt`
 *   ít nhất MỘT ngày. Hai mốc trùng nhau thì job hết hạn (đổi bài sang `EXPIRED`) và job tự
 *   chọn (chỉ xét bài `PUBLISHED`) chạy trước sau tuỳ may — bài còn người xin có thể chết mà
 *   không ai được chọn. `availableDay = 1` vì thế cho hạn xét = lúc đăng: lượt chạy kế tiếp
 *   của job tự chọn là chọn.
 */
export function wantedLifecycleDates(
  publishedAt: Date,
  availableDay: number,
): { selectionDeadline: Date; expiresAt: Date } {
  return {
    selectionDeadline: addDays(
      publishedAt,
      Math.min(SelectionWindowDays, availableDay - 1),
    ),
    expiresAt: addDays(publishedAt, availableDay),
  };
}

/**
 * Cộng thêm tháng mà KHÔNG để ngày tràn sang tháng sau.
 *
 * `Date.setMonth()` trần cộng xong mới chuẩn hoá, nên 30/11 cộng 3 tháng ra
 * 30/02 rồi bị đẩy thành 02/03 — bài hết hạn sớm hai ngày so với điều đã hứa
 * với người đăng. Ở đây kẹp về ngày cuối tháng đích: 30/11 → 28/02.
 */
export function addMonthsClamped(from: Date, months: number): Date {
  const year = from.getFullYear();
  const month = from.getMonth() + months;
  const lastDayOfTargetMonth = new Date(year, month + 1, 0).getDate();

  const result = new Date(from);
  result.setDate(Math.min(from.getDate(), lastDayOfTargetMonth));
  result.setMonth(month);
  return result;
}

/** Mốc hết hạn của một bài vừa được đưa lên công khai. */
export function postExpiryDate(publishedAt: Date): Date {
  return addMonthsClamped(publishedAt, PostLifetimeMonths);
}
