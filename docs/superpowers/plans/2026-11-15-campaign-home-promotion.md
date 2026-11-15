# Đề xuất chiến dịch lên trang chủ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Owner chiến dịch đề xuất banner lên các vị trí hiển thị; Admin duyệt trong màn banner hiện có; mobile nhận thêm nguồn/kiểu hiển thị.

**Architecture:** Đề xuất là một hàng `sponsor_banners` với `source_type = 'CAMPAIGN'`. Mở rộng bảng bằng một migration, mở rộng repository SQL thô, thêm ba use case owner vào module `sponsor-banner`, controller owner mới dưới prefix `charity-campaigns`.

**Tech Stack:** NestJS 11 + Fastify, TypeORM 0.3 (SQL thô qua `EntityManager.query`), PostgreSQL 16/PostGIS, Jest, script kiểm DB `ts-node`.

**Spec:** `docs/superpowers/specs/2026-11-15-campaign-home-promotion-design.md`

## Global Constraints

- `INVARIANTS.md`: body bọc khoá resource (`promotion`), params DTO riêng, `@ApiErrorResponses` (+ `...ApiTokenErrors`), POST trả 201 với `@ApiCreatedResponse`, exception qua `defineErrorCatalog` + `ExceptionFrom`, Symbol DI cùng tên interface, `handle()`.
- Mã lỗi mới tiếp nối nhóm banner `0x14`: `CAMPAIGN_PROMOTION_NOT_ELIGIBLE = 0x14_04` (409), `CAMPAIGN_PROMOTION_LIMIT_REACHED = 0x14_05` (409, thông điệp nêu mốc), `CAMPAIGN_PROMOTION_NOT_FOUND = 0x14_06` (404), `SPONSOR_BANNER_CHANGED_SINCE_VIEWED = 0x14_07` (409). Sau đó `npm run docs:errors`.
- Khoá cấu hình: `banner.campaign_promotion.max_open_per_campaign`, INTEGER, mặc định `3`, hợp lệ 1–20 (ngoài khoảng/không phải số nguyên → 3).
- Link server dựng: `chantam://campaign/<campaign_global_id>`. `partner_name` = tiêu đề chiến dịch cắt 200 ký tự.
- Cặp vị trí–kiểu: `APP_SPLASH` ⇔ `FULLSCREEN`; vị trí khác nhận `BANNER|SLIDER|INLINE|FLOATING`. Mặc định khi backfill/Admin bỏ trống: `HOME_HERO`→`SLIDER`, `APP_SPLASH`→`FULLSCREEN`, còn lại→`BANNER`.
- Chiến dịch đủ điều kiện = `approval_status='APPROVED' AND is_active AND deleted_at IS NULL` — dùng cho cả kiểm khi owner ghi lẫn lọc phục vụ.
- "Đang mở" = `source_type='CAMPAIGN' AND source_id=$id AND deleted_at IS NULL AND (approval_status='PENDING_APPROVAL' OR (approval_status='APPROVED' AND ends_at > now()))`.
- Sửa `core-lib` → build lại trước khi test `core`. SQL thô → chạy `test:banner` trên PostGIS thật (bật Docker Desktop). Không commit cho tới khi người dùng yêu cầu.
- Test tập trung: `npm run test --workspace=@chantam.vn/chantam.core -- <paths>`; core-lib: `npm run test --workspace=@chantam.vn/chantam.core-lib -- <paths>` (nếu workspace có script test, nếu không chạy spec qua jest của core-lib).

## Review Focus

1. Hai lượt POST song song khi chiến dịch còn đúng 1 suất: chỉ một lượt thành công (khoá `FOR UPDATE` trên hàng `campaigns`), lượt kia 409.
2. Chiến dịch bị đóng (`is_active=false`) sau khi banner đã duyệt: banner biến khỏi `GET /banners` VÀ `POST /banners/:id/click` trả không phục vụ.
3. PATCH một phần chỉ đổi `placement` sang `APP_SPLASH` trên hàng đang `BANNER` → 400 từ use case, không phải 500 từ CHECK.
4. `promotionId` thuộc chiến dịch X gọi qua URL chiến dịch Y (kể cả Y cũng của mình) → 404 `CAMPAIGN_PROMOTION_NOT_FOUND`.
5. Banner đối tác có sẵn trước migration vẫn được phục vụ y như cũ, `display_type` backfill đúng theo vị trí, `source_type='SPONSORED'`.

Mỗi mục có test ở task sở hữu (đánh dấu **[RF n]**).

---

### Task 1: core-lib — hằng số, luật thuần, mã lỗi

**Files:**
- Modify: `suites/chantam.vn/chantam/core-lib/src/models/sponsor-banner.ts`
- Test: `suites/chantam.vn/chantam/core-lib/src/models/sponsor-banner.spec.ts`
- Modify: `suites/chantam.vn/chantam/core-lib/src/consts/error-codes.ts`, `error-catalog.ts`

**Interfaces — Produces:**
- `BannerPlacements` thêm `'APP_SPLASH'`; `BannerPlacementLabels.APP_SPLASH = 'Poster sau màn chờ'`.
- `BannerSourceTypes = ['ADMIN','CAMPAIGN','SPONSORED'] as const`, `type BannerSourceType`.
- `BannerDisplayTypes = ['FULLSCREEN','BANNER','SLIDER','INLINE','FLOATING'] as const`, `type BannerDisplayType`.
- `defaultBannerDisplayType(placement: BannerPlacement): BannerDisplayType`.
- `bannerDisplayTypeGaps(placement: BannerPlacement, displayType: string): string[]` — rỗng khi hợp lệ.
- `CampaignPromotionMaxOpenConfigKey = 'banner.campaign_promotion.max_open_per_campaign'`, `DefaultCampaignPromotionMaxOpen = 3`, `normalizeCampaignPromotionMaxOpen(value: unknown): number`.
- `campaignPromotionTargetUrl(campaignGlobalId: string): string`.
- `type CampaignPromotionServingState = 'PENDING'|'REJECTED'|'INACTIVE'|'SCHEDULED'|'RUNNING'|'EXPIRED'` và `campaignPromotionServingState(input: { approvalStatus; isActive; startsAt: Date; endsAt: Date; now: Date }): CampaignPromotionServingState` — thứ tự: PENDING → REJECTED → INACTIVE → EXPIRED (`endsAt <= now`) → SCHEDULED (`startsAt > now`) → RUNNING.
- `CoreErrors.CAMPAIGN_PROMOTION_NOT_ELIGIBLE`, `CAMPAIGN_PROMOTION_LIMIT_REACHED` (tham số `max: number`, có `sample`), `CAMPAIGN_PROMOTION_NOT_FOUND`, `SPONSOR_BANNER_CHANGED_SINCE_VIEWED`.

- [ ] **Step 1: Test đỏ** trong `sponsor-banner.spec.ts`: `bannerDisplayTypeGaps('APP_SPLASH','BANNER')` không rỗng; `('HOME_HERO','FULLSCREEN')` không rỗng; `('HOME_HERO','SLIDER')` rỗng; kiểu lạ `'POPUP'` không rỗng; `defaultBannerDisplayType` cho 3 nhánh; `normalizeCampaignPromotionMaxOpen` với `5`→5, `0`→3, `21`→3, `2.5`→3, `'4'`→3, `null`→3; `campaignPromotionTargetUrl('abc')==='chantam://campaign/abc'` và `isBannerTargetUrl` của nó là `true`; `campaignPromotionServingState` đủ 6 nhánh.
- [ ] **Step 2: Chạy, xác nhận đỏ** (import thiếu).
- [ ] **Step 3: Cài đặt** các export trên; thêm mã lỗi + mục danh mục (HTTP 409/409/404/409, thông điệp tiếng Việt).
- [ ] **Step 4: Chạy lại → xanh; `npm run build --workspace=@chantam.vn/chantam.core-lib`.**

### Task 2: Migration + mọi chỗ INSERT

**Files:**
- Create: `suites/chantam.vn/chantam/core/src/infrastructure/persistence/migrations/1803400000000-CampaignHomePromotion.ts`
- Modify: `.../migrations/index.ts` (export cuối)
- Modify: `.../seeds/full/content-inbox.ts` (INSERT sponsor_banners thêm `display_type`)
- Modify: `suites/chantam.vn/chantam/core/test/sponsor-banner.check.ts` (helper INSERT thêm `display_type`)

**Interfaces — Produces:** cột `source_type varchar(20) NOT NULL DEFAULT 'SPONSORED'`, `source_id uuid NULL FK campaigns(global_id) ON DELETE RESTRICT`, `requested_by uuid NULL FK users(global_id) ON DELETE SET NULL`, `display_type varchar(20) NOT NULL`; CHECK `CHK_sponsor_banners_source_type`, `CHK_sponsor_banners_source_id` (`(source_type='CAMPAIGN') = (source_id IS NOT NULL)`), `CHK_sponsor_banners_display_type`, `CHK_sponsor_banners_splash_fullscreen` (`(placement='APP_SPLASH') = (display_type='FULLSCREEN')`); `CHK_sponsor_banners_placement` viết lại thêm `APP_SPLASH` (danh sách viết cứng, theo lối `1801900000000`); index `IDX_sponsor_banners_campaign_source ON (source_id) WHERE source_type='CAMPAIGN' AND deleted_at IS NULL`; `INSERT INTO system_configs` khoá mốc giá trị `'3'`, `INTEGER`, `ON CONFLICT DO NOTHING`.

- [ ] **Step 1: Viết `up`**: thêm 3 cột (display_type nullable) → `UPDATE ... SET display_type = CASE placement WHEN 'HOME_HERO' THEN 'SLIDER' ELSE 'BANNER' END` → `SET NOT NULL` → CHECK/FK/index → placement CHECK → seed config. **`down`**: xoá theo thứ tự ngược; placement CHECK về danh sách 12 vị trí (Postgres tự từ chối nếu đã có hàng `APP_SPLASH`); xoá dòng config.
- [ ] **Step 2: Sửa hai chỗ INSERT** (seed full, `sponsor-banner.check.ts`) ghi `display_type` đúng theo placement của hàng.
- [ ] **Step 3: Chạy `barrel-guard` spec** (`npm run test --workspace=@chantam.vn/chantam.core -- src/infrastructure/persistence/migrations`) → xanh.
- [ ] **Step 4: DB thật** — bật Docker, `docker compose up -d`, `npm run migration:run --workspace=@chantam.vn/chantam.core`, rồi `migration:revert` và `migration:run` lại (down/up chạy được). **[RF 5]** truy vấn: hàng banner có sẵn có `source_type='SPONSORED'`, `display_type` đúng.

### Task 3: Repository + port

**Files:**
- Modify: `core/src/domain/ports/repository/sponsor-banner.repository.ts`
- Modify: `core/src/infrastructure/repository/sponsor-banner.repository.ts`
- Test: `core/test/sponsor-banner.check.ts` (kiểm trên DB thật)

**Interfaces — Consumes:** Task 1 types. **Produces:**
- `ISponsorBanner` thêm `sourceType: BannerSourceType; sourceId: string | null; requestedBy: string | null; displayType: BannerDisplayType`.
- `IWriteSponsorBannerParams` thêm `displayType: BannerDisplayType`; `ICreateSponsorBannerParams` thêm `sourceType: 'ADMIN' | 'SPONSORED'` (CAMPAIGN chỉ qua method riêng).
- `ISponsorBannerAdminItem extends ISponsorBanner { source: { campaignId: string; title: string; slug: string } | null; requester: { userId: string; fullName: string | null } | null }`; `listForAdmin` nhận thêm `sourceType?`, `sourceId?`, trả `{ items: ISponsorBannerAdminItem[]; total }` (LEFT JOIN `campaigns`, `users`; câu đếm cùng `WHERE`).
- `ServingFilter` thêm `AND (source_type <> 'CAMPAIGN' OR EXISTS (SELECT 1 FROM campaigns c WHERE c.global_id = sponsor_banners.source_id AND c.approval_status = 'APPROVED' AND c.is_active AND c.deleted_at IS NULL))` — dùng ở `findServing` và `recordClick`.
- `createCampaignPromotion(params: { campaignId; requestedBy; partnerName; title; imageUrl; targetUrl; placement; displayType; displayOrder; startsAt; endsAt; maxOpen: number }): Promise<{ kind: 'CREATED'; banner: ISponsorBanner } | { kind: 'NOT_ELIGIBLE' } | { kind: 'LIMIT_REACHED' }>` — một transaction: `SELECT ... FROM campaigns WHERE global_id=$1 FOR UPDATE` (kiểm đủ điều kiện) → đếm "đang mở" → `INSERT` (`source_type='CAMPAIGN'`, `approval_status='PENDING_APPROVAL'`, `created_by = requested_by`).
- `listByCampaign(campaignId: string): Promise<ISponsorBanner[]>` — chưa xoá, `created_at DESC, id DESC`.
- `findCampaignPromotion(campaignId: string, promotionId: string): Promise<ISponsorBanner | null>` — khớp cả hai id, `source_type='CAMPAIGN'`, chưa xoá.
- `updateCampaignPromotion(params: { campaignId; promotionId; changes: Partial<Pick<IWriteSponsorBannerParams,'title'|'imageUrl'|'placement'|'displayType'|'displayOrder'|'startsAt'|'endsAt'>>; maxOpen: number }): Promise<{ kind: 'UPDATED'; banner } | { kind: 'NOT_FOUND' } | { kind: 'NOT_ELIGIBLE' } | { kind: 'LIMIT_REACHED' }>` — transaction: khoá hàng `campaigns` → kiểm đủ điều kiện → `SELECT ... FOR UPDATE` hàng banner → nếu hàng đang "không tính" và sau sửa sẽ "đang mở" thì đếm (loại trừ chính nó) → `UPDATE` thay đổi + `approval_status='PENDING_APPROVAL', approved_at=NULL, approved_by=NULL, approval_note=NULL, updated_at=now()`.
- `decideApproval` nhận thêm `expectedUpdatedAt: Date | null`, trả `{ kind: 'DECIDED'; banner } | { kind: 'ALREADY_DECIDED' } | { kind: 'CHANGED' }` — `WHERE ... AND ($5::timestamptz IS NULL OR updated_at = $5)`; không khớp thì đọc lại hàng để phân biệt hai lý do (status ≠ PENDING → ALREADY_DECIDED, còn lại → CHANGED).
- `update`/`create` ghi thêm `display_type` (và `source_type` cho create).

- [ ] **Step 1: Mở rộng `test:banner`** (đọc file trước, theo khuôn `check(...)` sẵn có) với các ca: tạo đề xuất qua `createCampaignPromotion` cho chiến dịch APPROVED → PENDING, không hiện ở `findServing`; duyệt → hiện; đóng chiến dịch (`UPDATE campaigns SET is_active=false`) → biến khỏi `findServing` và `recordClick` trả `false` **[RF 2]**; mở lại → hiện lại; mốc 3: tạo 3 rồi lần 4 → `LIMIT_REACHED`; từ chối 1 rồi tạo được thêm 1; gửi lại hàng bị từ chối khi đã đủ 3 mở → `LIMIT_REACHED`; hai `createCampaignPromotion` chạy `Promise.all` khi còn 1 suất → đúng một `CREATED` **[RF 1]**; `findCampaignPromotion` với campaign khác → `null` **[RF 4]**; `decideApproval` với `expectedUpdatedAt` cũ → `CHANGED`, đã quyết → `ALREADY_DECIDED`; `listForAdmin({ sourceType:'CAMPAIGN', sourceId })` trả `source.title` và `requester`, và `total` khớp số hàng; banner SPONSORED sẵn có vẫn được phục vụ **[RF 5]**.
- [ ] **Step 2: Chạy `npm run test:banner --workspace=@chantam.vn/chantam.core` → đỏ.**
- [ ] **Step 3: Cài đặt port + repository.** Lưu ý bẫy đã gặp: `UPDATE ... RETURNING` đi qua `updateReturning`; không dùng lại cùng `$n` với hai kiểu khác nhau (42P08) — truyền giá trị hai lần nếu cần.
- [ ] **Step 4: Chạy lại `test:banner` → xanh; `npm run test --workspace=@chantam.vn/chantam.core -- src/infrastructure/repository` → xanh (gồm `update-returning-guard`, `reserved-sql-alias`).**

### Task 4: Use case Admin + public, DTO, controller

**Files:**
- Modify: `core/src/application/contracts/sponsor-banner/sponsor-banner.contract.ts`, `core/src/application/implementations/sponsor-banner/sponsor-banner.use-cases.ts`, `.../sponsor-banner.use-cases.spec.ts`
- Modify: `core/src/domain/exceptions/sponsor-banner.exception.ts` (+4 class `ExceptionFrom`)
- Modify: `core/src/infrastructure/controller/dto/sponsor-banner/sponsor-banner.dto.ts`, `.../api/sponsor-banner/sponsor-banner.controller.ts`

**Interfaces — Consumes:** Task 3. **Produces:**
- `IWriteSponsorBannerInput` thêm `displayType?: string`, `sourceType?: string` (chỉ create).
- `IPublicSponsorBannerDto` thêm `sourceType, sourceId, displayType, startsAt, endsAt`.
- `IListAdminSponsorBannersCommand` thêm `sourceType?`, `sourceId?`; `IDecideSponsorBannerApprovalCommand` thêm `expectedUpdatedAt?: string`.
- Exceptions: `CampaignPromotionNotEligibleException`, `CampaignPromotionLimitReachedException` (ctor nhận `max`), `CampaignPromotionNotFoundException`, `SponsorBannerChangedSinceViewedException`.

- [ ] **Step 1: Test đỏ** trong `sponsor-banner.use-cases.spec.ts`: Admin create không gửi `displayType` cho `HOME_HERO` → lưu `SLIDER`; `APP_SPLASH`+`BANNER` → 400; `sourceType:'CAMPAIGN'` → 400; mặc định `SPONSORED`; Admin update hàng `CAMPAIGN` gửi `targetUrl` → 400, gửi `displayOrder` → được, trạng thái duyệt không đổi; update một phần chỉ `placement:'APP_SPLASH'` trên hàng `BANNER` → 400 **[RF 3]**; reject không `note` (hoặc chỉ khoảng trắng) → 400, approve không note → được; decide trả `CHANGED` → `SponsorBannerChangedSinceViewedException`; `ALREADY_DECIDED` → exception cũ; serve trả đủ 5 trường mới; list chuyển `sourceType`/`sourceId` xuống repository.
- [ ] **Step 2: Chạy, xác nhận đỏ.**
- [ ] **Step 3: Cài đặt.** Kiểm cặp vị trí–kiểu bằng `bannerDisplayTypeGaps` trên giá trị đã trộn với hàng đang lưu (update đọc `findByGlobalId` trước). DTO: `displayType` (`@IsIn(BannerDisplayTypes)`), `sourceType` (`@IsIn(['ADMIN','SPONSORED'])`), lọc list `sourceType`/`sourceId` (`@IsUUID`), `expectedUpdatedAt` (`@IsISO8601`, tuỳ chọn); response Admin thêm `sourceType, sourceId, displayType, source, requester`; response public thêm 5 trường. `@ApiErrorResponses` của approval thêm `SponsorBannerChangedSinceViewedException`.
- [ ] **Step 4: Chạy spec + `src/infrastructure/controller` (body-wrapper, swagger-replace, not-null-when-present guards) → xanh.**

### Task 5: Use case + API owner

**Files:**
- Create: `core/src/application/contracts/sponsor-banner/campaign-promotion.contract.ts` (+ re-export ở barrel `index.ts`)
- Create: `core/src/application/implementations/sponsor-banner/campaign-promotion.use-cases.ts`, `.../campaign-promotion.use-cases.spec.ts`
- Modify: `core/src/application/implementations/sponsor-banner/sponsor-banner.module.ts` (đăng ký 3 use case; module phải có `IObjectStorage`, `ICharityCampaignRepository`, `IAdminConfigRepository` — theo cách `charity-campaign` module lấy chúng)
- Create: `core/src/infrastructure/controller/dto/sponsor-banner/campaign-promotion.dto.ts`
- Create: `core/src/infrastructure/controller/api/sponsor-banner/campaign-promotion.controller.ts` (`@Controller('charity-campaigns')`), đăng ký ở `sponsor-banner.module.ts` (api)

**Interfaces — Consumes:** Task 1–4. **Produces:**
- `ICampaignPromotionInput { title: string; imageKey: string; placement: string; displayType: string; displayOrder?: number; startsAt: string; endsAt: string }`; `ICreateCampaignPromotionCommand { actorUserId; campaignId; promotion: ICampaignPromotionInput }`; `IUpdateCampaignPromotionCommand { actorUserId; campaignId; promotionId; promotion: Partial<ICampaignPromotionInput> }`; `IListCampaignPromotionsCommand { actorUserId; campaignId }`.
- `ICampaignPromotionDto { globalId; title; imageUrl; targetUrl; placement; displayType; displayOrder; startsAt; endsAt; approvalStatus; approvalNote; isActive; servingState; createdAt; updatedAt }` — không có impression/click.
- Symbols `ICreateCampaignPromotionUseCase`, `IListCampaignPromotionsUseCase`, `IUpdateCampaignPromotionUseCase`.
- Routes: `POST /charity-campaigns/:id/promotions` (201), `GET /charity-campaigns/:id/promotions`, `PATCH /charity-campaigns/:id/promotions/:promotionId`. Params DTO: `CampaignPromotionParamsDto { id: uuid }`, `CampaignPromotionItemParamsDto { id: uuid; promotionId: uuid }`.

- [ ] **Step 1: Test đỏ** (mock repository/storage/config theo khuôn spec banner): chiến dịch không tồn tại/đã xoá → `CharityCampaignNotFound` (dùng exception sẵn có của charity); không phải chủ → `Forbidden`; chưa duyệt → `CampaignPromotionNotEligibleException`; cặp vị trí–kiểu sai → 400 trước khi gọi storage; `imageKey` storage trả VIDEO → 400; storage trả `publicUrl` không phải `https://` → 400 (không gọi repository); repository `LIMIT_REACHED` → exception mang con số mốc đọc từ config (config `7` → thông điệp có 7; config rác → 3); thành công → repository nhận `targetUrl = chantam://campaign/<id>`, `partnerName` = tiêu đề chiến dịch cắt 200, `requestedBy = actor`; list chỉ chủ xem, có `servingState`; PATCH body rỗng → 400; PATCH `NOT_FOUND` → `CampaignPromotionNotFoundException` **[RF 4]**; PATCH có `imageKey` → xác minh lại qua storage; PATCH cặp sau trộn sai → 400 **[RF 3]**.
- [ ] **Step 2: Chạy, xác nhận đỏ.**
- [ ] **Step 3: Cài đặt** use case, DTO (body `@ValidateNested` khoá `promotion`; `title` 1–200; `imageKey` string ≤500; `placement` `@IsIn(BannerPlacements)`; `displayType` `@IsIn(BannerDisplayTypes)`; `displayOrder` int ≥0; `startsAt/endsAt` ISO), controller (`@ApiCreatedResponse` cho POST, `@ApiErrorResponses(...)` + `...ApiTokenErrors`).
- [ ] **Step 4: Chạy spec + `src/infrastructure/controller/api` (route-order-guard, public-route-inventory, api.module) → xanh.**

### Task 6: Kiểm kê, tài liệu, kiểm toàn bộ

**Files:**
- Modify: `core/test/config-inventory.check.ts` (thêm `CampaignPromotionMaxOpenConfigKey` với chú thích ai đọc)
- Modify: `docs/API.md` (mục banner: nguồn, kiểu, `APP_SPLASH`, owner API, lọc Admin, `expectedUpdatedAt`, reject bắt buộc lý do, ẩn theo chiến dịch), `docs/FEATURES.md`, `docs/CONFIG-INVENTORY.md`, `docs/DATABASE.md`, `README.md` của `core` nếu liệt kê endpoint
- Generate: `docs/API-ERRORS.md` qua `npm run docs:errors`

- [ ] **Step 1: Cập nhật kiểm kê + tài liệu; `npm run docs:errors`.**
- [ ] **Step 2: Build** `core-lib` + `core`; `npm run test --workspace=@chantam.vn/chantam.core` → toàn bộ xanh; `npm run lint:check`, `npm run format:check`, `npm run typecheck:checks --workspace=@chantam.vn/chantam.core` → xanh.
- [ ] **Step 3: DB thật (Docker):** `migration:run`, `test:banner`, `test:seed-full` (sau `seed:full`), `test:config-inventory`, `test:charity` → xanh.
- [ ] **Step 4: Review độc lập toàn diff** (reviewer đọc thẳng working tree, không tách worktree), kèm mục Review Focus.
- [ ] Không commit cho tới khi người dùng yêu cầu.
