# Đề xuất chiến dịch lên trang chủ — thiết kế backend

Ngày: 15/11/2026. Nguồn: đặc tả PR #53 (`docs/superpowers/specs/2026-11-14-campaign-home-promotion.md`,
Nguyen Son) + 9 quyết định người dùng chốt ngày 15/11. Tài liệu này **thay** PR #53 ở các điểm ghi
"(chốt 15/11)".

## Ý định

Chủ một hoạt động từ thiện (`campaigns`, chủ = `campaigns.created_by`) gửi đề xuất quảng bá chiến
dịch lên các vị trí hiển thị của app. Admin duyệt trong **đúng màn Banner tài trợ hiện có** — không
dựng màn thứ hai, không dựng bảng thứ hai: đề xuất CHÍNH LÀ một hàng `sponsor_banners`.

## Hiện trạng (không phải làm lại)

`sponsor_banners` (migration `1798500000000`, `1800800000000`, `1801900000000`) đã có:
`approval_status` (`PENDING_APPROVAL`/`APPROVED`/`REJECTED`, CHECK khớp `approved_at`),
`approval_note`, `approved_by`, `is_active` (mặc định `true`), `deleted_at`, `starts_at`/`ends_at`,
`display_order`, `placement` (allowlist 12 vị trí, khớp `BannerPlacements` ở core-lib — `test:banner` so
hai bên), `impression_count`/`click_count`. Endpoint Admin: `GET/POST /admin/banners`,
`PATCH /admin/banners/:id`, `PATCH /admin/banners/:id/approval` (chỉ chuyển được từ
`PENDING_APPROVAL`), `PATCH /admin/banners/:id/active`, `DELETE /admin/banners/:id`. Công khai:
`GET /banners?placement=` đã lọc đúng 5 điều kiện của đặc tả, `POST /banners/:id/click`.
Admin tạo banner → vào thẳng `APPROVED`.

## Mục tiêu / không làm / phản mục tiêu

**Mục tiêu**
- Owner tạo, xem, sửa đề xuất cho chiến dịch của mình; đề xuất vào `PENDING_APPROVAL`.
- Admin thấy đề xuất trong danh sách banner, lọc theo nguồn, thấy chiến dịch nguồn và người đề xuất,
  duyệt/từ chối (từ chối bắt buộc lý do), sửa vị trí/thứ tự/lịch, bật/tắt, xoá.
- Mobile nhận thêm `sourceType`, `sourceId`, `displayType`, `startsAt`, `endsAt`.

**Không làm**
- Không bảng revision. Không thông báo đẩy cho owner khi duyệt/từ chối (owner xem trạng thái qua
  `GET`; có thể làm sau). Không cho owner rút/xoá đề xuất. Không đổi FE Admin (phần FE nằm ở PR #53).
- Không đổi cách đếm impression/click.

**Phản mục tiêu**
- Owner tự bật, tự duyệt, hoặc sửa mà nội dung đang chạy đổi theo không qua duyệt.
- Owner đề xuất cho chiến dịch không phải của mình, hoặc chiến dịch chưa được duyệt.
- Owner tự đặt link trỏ ra ngoài, hoặc dán URL ảnh tuỳ ý.
- Banner cũ của đối tác đổi hành vi hiển thị sau migration.

## Quyết định đã chốt (15/11)

1. **Duyệt xong chạy luôn** — `is_active` giữ mặc định `true`; duyệt là lên (nếu đã tới `starts_at`).
   Bỏ câu "Sau khi duyệt, Admin vẫn phải bật banner" của PR #53.
2. **Owner sửa sau duyệt → quay về `PENDING_APPROVAL`** (banner tạm rời app tới khi duyệt lại). Không
   revision.
3. **Đường dẫn owner** dưới `/charity-campaigns/:id/promotions` (cùng nhà với mọi thao tác owner),
   không phải `/campaigns/...` (prefix đó là API công khai chỉ đọc, `:idOrSlug`).
4. **Ảnh** dùng lại `POST /charity-campaigns/media/upload` → owner gửi `imageKey`; server xác minh qua
   `storage.confirmCampaignMediaUpload(userId, key)`, bắt buộc là ảnh, rồi tự dựng `image_url`.
5. **Link do server tạo**: `target_url = chantam://campaign/<campaign_global_id>`. Owner không gửi
   link. Dùng `global_id` chứ không `slug` để link không gãy nếu slug đổi.
6. **`title` và `partner_name`** (NOT NULL hiện có): owner gửi `title` (nội dung quảng bá, ≤ 200);
   server điền `partner_name` = tiêu đề chiến dịch lúc tạo đề xuất.
7. **`display_type` vs `placement`** (để người làm quyết — chốt như sau):
   - Thêm vị trí `APP_SPLASH` (poster sau Splash) vào `BannerPlacements` + CHECK DB + nhãn
     "Poster sau màn chờ".
   - `APP_SPLASH` chỉ đi với `FULLSCREEN`; `FULLSCREEN` chỉ đi với `APP_SPLASH`. Mọi vị trí khác nhận
     `BANNER | SLIDER | INLINE | FLOATING`.
   - Luật này là một hàm thuần ở core-lib (`bannerDisplayTypeGaps(placement, displayType)`), áp ở cả
     đường Admin lẫn đường owner, và có CHECK tương ứng ở DB.
8. **Điều kiện đề xuất**: chiến dịch `approval_status = 'APPROVED'`, `is_active`, `deleted_at IS
   NULL`. Khung giờ banner **được vượt** `campaigns.end_time`. **Mốc số lượng**: khoá cấu hình
   `banner.campaign_promotion.max_open_per_campaign` (INTEGER, mặc định **3**, hợp lệ 1–20, ngoài
   khoảng → mặc định). "Đang mở" = hàng `source_type='CAMPAIGN'`, cùng `source_id`, chưa xoá, và
   (`PENDING_APPROVAL` hoặc (`APPROVED` và `ends_at > now()`)). `REJECTED` và đã hết hạn không tính.
   Đếm và chèn dưới khoá hàng của chiến dịch (`SELECT ... FOR UPDATE` trên `campaigns`) để hai lượt
   gửi song song không cùng lọt qua mốc.
9. **Banner cũ** backfill `source_type = 'SPONSORED'`.
10. **Chiến dịch hết đủ điều kiện thì banner tự ẩn** (chốt 15/11, phương án B): banner nguồn
    `CAMPAIGN` chỉ được phục vụ khi chiến dịch nguồn vẫn `approval_status = 'APPROVED'`, `is_active`
    và `deleted_at IS NULL` — đóng (`closeCampaign` đặt `is_active = false`), đình chỉ hay xoá đều
    làm banner rời app ngay, không cần job hay cascade. Chiến dịch khôi phục thì banner tự hiện lại
    (nếu vẫn trong khung giờ). Chiến dịch chỉ quá `end_time` mà chưa đóng thì banner vẫn chạy
    (quyết định 8). Thêm vào lọc phục vụ:
    `AND (source_type <> 'CAMPAIGN' OR EXISTS (SELECT 1 FROM campaigns c WHERE c.global_id =
    sponsor_banners.source_id AND c.approval_status = 'APPROVED' AND c.is_active AND c.deleted_at IS
    NULL))`. Banner `SPONSORED`/`ADMIN` không đổi đường đọc. `POST /banners/:id/click` dùng cùng lọc.

### Quyết định của người viết (sau bước soát của người làm, 15/11)

- **Mốc giữ cả khi gửi lại.** PATCH chuyển một hàng từ "không tính" (`REJECTED`, hoặc `APPROVED` đã
  hết hạn) sang "đang mở" thì đếm lại dưới cùng khoá hàng `campaigns` như POST; vượt mốc → 409
  `CAMPAIGN_PROMOTION_LIMIT_REACHED`. Hàng vốn đang mở thì không đếm lại.
- **Owner PATCH kiểm lại điều kiện chiến dịch** (cùng luật POST, 409 `CAMPAIGN_PROMOTION_NOT_ELIGIBLE`).
- **Chống duyệt nhầm phiên bản:** `PATCH /admin/banners/:id/approval` nhận `expectedUpdatedAt`
  **tuỳ chọn**; có gửi mà `updated_at` của hàng khác → 409 `SPONSOR_BANNER_CHANGED_SINCE_VIEWED`. Không
  gửi thì giữ hành vi cũ (FE hiện tại không gãy). FE Admin (PR #53) nên gửi trường này.
- **Admin sửa hàng `CAMPAIGN`:** được đổi `title`, `imageUrl`, `placement`, `displayType`,
  `displayOrder`, lịch; **không** được đổi `targetUrl`, `partnerName`, `partnerContact` (link do server
  dựng, tên đối tác là ảnh chụp tên chiến dịch) → 400 nếu gửi.
- **Danh sách Admin** thêm lọc `sourceId` để chi tiết chiến dịch phía Admin hiện được các đề xuất
  của nó (read-only, link sang màn banner).
- `partner_name` cắt về 200 ký tự nếu tiêu đề chiến dịch dài hơn; cặp vị trí–kiểu khi PATCH một phần
  kiểm theo giá trị sau khi trộn với hàng đang lưu.

## Dữ liệu — migration mới trên `sponsor_banners`

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| `source_type` | `varchar(20) NOT NULL DEFAULT 'SPONSORED'` | CHECK `IN ('ADMIN','CAMPAIGN','SPONSORED')` |
| `source_id` | `uuid NULL` | FK `campaigns(global_id) ON DELETE SET NULL`… xem ràng buộc dưới |
| `requested_by` | `uuid NULL` | FK `users(global_id) ON DELETE SET NULL` |
| `display_type` | `varchar(20) NOT NULL` | CHECK `IN ('FULLSCREEN','BANNER','SLIDER','INLINE','FLOATING')` |

- Backfill `display_type`: `HOME_HERO` → `SLIDER`, còn lại → `BANNER`. Thêm cột nullable → backfill →
  `SET NOT NULL` (không để DEFAULT cố định, vì mặc định đúng phụ thuộc vị trí).
- CHECK `source_type = 'CAMPAIGN'` ⇔ `source_id IS NOT NULL`. Vì vậy FK `source_id` dùng
  `ON DELETE RESTRICT` (campaigns chỉ xoá mềm; SET NULL sẽ vi phạm CHECK).
- CHECK cặp vị trí–kiểu: `(placement = 'APP_SPLASH') = (display_type = 'FULLSCREEN')`.
- Mở rộng CHECK `placement` thêm `APP_SPLASH` (cùng lối `1801900000000`: viết cứng danh sách).
- Index đếm mốc: `(source_id) WHERE source_type = 'CAMPAIGN' AND deleted_at IS NULL`.
- Index phục vụ `IDX_sponsor_banners_serving` giữ nguyên; điều kiện chiến dịch là `EXISTS` theo khoá
  duy nhất `campaigns.global_id`, chỉ chạy cho hàng `CAMPAIGN`.

## API

### Owner (Bearer, chủ chiến dịch)

`POST /api/v1/charity-campaigns/:id/promotions` — body bọc khoá `promotion`:
`{ title, imageKey, placement, displayType, displayOrder?, startsAt, endsAt }`.
Kiểm theo thứ tự: chiến dịch tồn tại (404) → là chủ (403) → chiến dịch đủ điều kiện (409
`CAMPAIGN_PROMOTION_NOT_ELIGIBLE`) → hình dạng (400: cặp vị trí–kiểu, `endsAt > startsAt`, vị trí
trong allowlist) → ảnh (`imageKey` qua storage) → mốc (409 `CAMPAIGN_PROMOTION_LIMIT_REACHED`, kèm
con số mốc). Tạo hàng `source_type='CAMPAIGN'`, `source_id`, `requested_by = created_by = actor`,
`approval_status='PENDING_APPROVAL'`, `target_url` server dựng, `partner_name` = tiêu đề chiến dịch.
Trả **201** `{ promotion }`.

`GET /api/v1/charity-campaigns/:id/promotions` — chỉ chủ chiến dịch; mọi đề xuất (chưa xoá) của chiến
dịch, mới nhất trước, kèm `approvalStatus`, `approvalNote` (lý do từ chối), `isActive`, lịch, vị trí,
kiểu, ảnh, và trạng thái suy ra `servingState`: `PENDING | REJECTED | SCHEDULED | RUNNING | EXPIRED |
INACTIVE`. Không trả impression/click (đó là số của Admin).

`PATCH /api/v1/charity-campaigns/:id/promotions/:promotionId` — chủ chiến dịch; mọi trường như POST,
đều tuỳ chọn. Sửa bất kỳ trường nào → `approval_status='PENDING_APPROVAL'`, `approved_at/by = NULL`,
`approval_note = NULL` (kể cả từ `REJECTED` — đây là đường gửi lại). Body rỗng → 400. Không đổi
`is_active`. Kiểm lại điều kiện chiến dịch; chuyển từ "không tính" sang "đang mở" thì kiểm lại mốc.

### Admin (giữ đường cũ, thêm phần thiếu)

- `GET /admin/banners`: thêm lọc `sourceType` và `sourceId`; mỗi item thêm `sourceType`, `sourceId`, `displayType`,
  `source: { campaignId, title, slug } | null`, `requestedBy: { userId, fullName } | null`.
- `POST /admin/banners`: nhận `displayType` (bắt buộc) và `sourceType` (`ADMIN | SPONSORED`, mặc định
  `SPONSORED`; `CAMPAIGN` → 400). Vẫn vào thẳng `APPROVED`.
- `PATCH /admin/banners/:id`: nhận `displayType`; Admin sửa **không** đổi trạng thái duyệt (Admin là
  người duyệt). Không cho đổi `sourceType`/`sourceId`/`requestedBy`; với hàng `CAMPAIGN` còn khoá
  `targetUrl`/`partnerName`/`partnerContact`.
- `PATCH /admin/banners/:id/approval`: `approve: false` mà `note` trống → 400 `VALIDATION_FAILED`
  (áp cho mọi banner). Nhận `expectedUpdatedAt` tuỳ chọn (xem quyết định của người viết).
- `PATCH /admin/banners/:id/active`, `DELETE` giữ nguyên.

### Công khai

`GET /banners?placement=` — mỗi banner thêm `sourceType`, `sourceId`, `displayType`, `startsAt`,
`endsAt`. Lọc phục vụ giữ 5 điều kiện cũ, **thêm** điều kiện chiến dịch nguồn của quyết định 10.
`APP_SPLASH` dùng đúng endpoint này.

## Mã lỗi mới (core-lib, `defineErrorCatalog`, `npm run docs:errors`)

- `CAMPAIGN_PROMOTION_NOT_ELIGIBLE` (409) — chiến dịch chưa duyệt / đã tắt / đã xoá.
- `CAMPAIGN_PROMOTION_LIMIT_REACHED` (409) — chạm mốc, thông điệp nêu con số.
- `CAMPAIGN_PROMOTION_NOT_FOUND` (404) — `promotionId` không thuộc chiến dịch hoặc đã xoá.
- `SPONSOR_BANNER_CHANGED_SINCE_VIEWED` (409) — duyệt với `expectedUpdatedAt` cũ.

## Ràng buộc

- Theo `INVARIANTS.md`: body bọc khoá resource, params DTO riêng, `@ApiErrorResponses`, `201` cho POST,
  exception qua danh mục lỗi, Symbol DI, `handle()`.
- SQL thô → cập nhật `test:banner` (`core/test/sponsor-banner.check.ts`) và chạy trên PostGIS thật
  (Docker); seed full phải phủ cột mới (`test:seed-full`); khoá cấu hình mới → `test:config-inventory`;
  route mới → `route-order-guard`, `public-route-inventory` nếu liên quan.
- `image_url` bị CHECK `LIKE 'https://%'`: URL công khai của storage ở môi trường dev phải là https,
  nếu không → trả 400 rõ ràng thay vì 500 từ Postgres.
- Cập nhật `docs/API.md`, `docs/FEATURES.md`, `docs/CONFIG-INVENTORY.md`, `docs/DATABASE.md`,
  `docs/API-ERRORS.md` (sinh tự động), README package nếu có danh sách endpoint.

## Để người làm tự quyết

Tên use case/DTO cụ thể, cách tách file contract, câu chữ Swagger, vị trí hàm thuần trong core-lib,
SQL cụ thể của phép đếm-và-chèn miễn là đúng khoá hàng nêu trên, thứ tự ưu tiên khi suy `servingState`.
Ranh giới `ADMIN` và `SPONSORED` chỉ là nhãn Admin chọn — không có luật nghiệp vụ nào khác nhau.
