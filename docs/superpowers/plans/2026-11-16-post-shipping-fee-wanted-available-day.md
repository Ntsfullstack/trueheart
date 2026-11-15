# Phí ship + thời gian tồn tại bài WANTED — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** `POST/PATCH /posts` nhận `shippingFee` (VND, chỉ khi `GIVER_SHIPS`); bài WANTED nhận `availableDay` 1–30 (mặc định 30) quyết định hạn sống.

**Architecture:** `shipping_fee` là cột mới cạnh `ship_payer` (cùng luật, cùng chỗ đọc ghi qua entity). `availableDay` là hàm thuần trong `core-lib/models/post-lifecycle.ts` tính `expiresAt` và `selectionDeadline`; giá trị lưu ở `details.availableDay`.

**Tech Stack:** NestJS 11, TypeORM entity, class-validator, Jest, PostGIS check scripts.

**Spec (đã duyệt trong hội thoại 16/11):**
- `shippingFee`: số nguyên VND ≥ 0, tuỳ chọn; chỉ khai khi `deliveryMethod = GIVER_SHIPS` (khác → 400, như `shipPayer`); PATCH đổi sang hình thức khác thì tự xoá về `null`; cột `posts.shipping_fee` + CHECK; response `post.shippingFee`.
- `availableDay` (chỉ WANTED): int 1–30, tuỳ chọn, mặc định 30; loại khác gửi → 400; `expiresAt = publishedAt + availableDay ngày` (bỏ 30 ngày mở rộng cho WANTED); `selectionDeadline = publishedAt + min(7, availableDay − 1) ngày`; lưu `details.availableDay`; chỉ đặt lúc tạo (không qua PATCH); gia hạn bài không đổi; OFFER không đổi.

## Global Constraints
- Thông điệp lỗi: `shippingFee chỉ khai được khi deliveryMethod là GIVER_SHIPS`; `availableDay chỉ áp dụng cho bài WANTED`.
- Trần `shippingFee`: `MaxShippingFee = 10_000_000` (VND) — chặn số gõ nhầm; CHECK DB `0..10_000_000`, NULL được; CHECK `shipping_fee IS NULL OR delivery_method = 'GIVER_SHIPS'`.
- Migration `1803500000000-PostShippingFee`.
- Sửa `core-lib` → build trước khi test `core`. Không push cho tới khi người dùng yêu cầu.

## Review Focus
1. PATCH đổi `deliveryMethod` sang `SELF_PICKUP` trên bài đang có `shippingFee` → phí về `null` (nếu không, CHECK DB ném 500).
2. `availableDay = 1` → `selectionDeadline = publishedAt` (không bằng `expiresAt`), `expiresAt = publishedAt + 1 ngày`.
3. WANTED không gửi `availableDay` → sống 30 ngày (không phải 37), `details.availableDay = 30`.
4. PATCH gửi `availableDay` → 400 (không âm thầm bỏ qua).
5. Bài OFFER giữ đúng 7 + 30 ngày.

### Task 1: core-lib — vòng đời WANTED theo `availableDay`, hằng phí ship
- Modify `core-lib/src/models/post-lifecycle.ts`: `MinWantedAvailableDays = 1`, `MaxWantedAvailableDays = 30`, `DefaultWantedAvailableDays = 30`, `wantedLifecycleDates(publishedAt: Date, availableDay: number): { selectionDeadline: Date; expiresAt: Date }`.
- Modify `core-lib/src/models/post.ts`: `IPost.shippingFee: number | null`; `MaxShippingFee = 10_000_000`.
- Modify `core-lib/src/dto/post/post.dto.ts`: `shippingFee?: number | null` ở `ICreatePostCommonDto` và `IUpdatePostDto`; `availableDay?: number` ở `ICreatePostDto`.
- Test `post-lifecycle.spec.ts` (tạo nếu chưa có): availableDay 30 → expiry +30, deadline +7; 7 → deadline +6, expiry +7; 1 → deadline = publishedAt, expiry +1. **[RF2]**

### Task 2: migration + entity + seed + fixtures
- Create migration (cột, CHECK `CHK_posts_shipping_fee_range`, `CHK_posts_shipping_fee_delivery`); barrel.
- Entity `shippingFee` (`shipping_fee`, int, nullable).
- `post.repository.ts` `createPostWithinQuota` ghi `shippingFee`; `gift-post-compat.mapper` `shippingFee: null`; spec fixtures thêm `shippingFee: null`.
- Chạy migration up/down/up trên DB thật.

### Task 3: use case + DTO
- Test đỏ ở `create-post.use-case.spec.ts`/`update-post.use-case.spec.ts`/DTO spec: shippingFee với SELF_PICKUP → 400; với GIVER_SHIPS → lưu; WANTED không availableDay → hạn 30 ngày, details `{ requirements: null, availableDay: 30 }` **[RF3]**; availableDay 1 **[RF2]**; OFFER gửi availableDay → 400; OFFER vẫn 37 ngày **[RF5]**; PATCH đổi sang SELF_PICKUP → `shippingFee: null` **[RF1]**; PATCH gửi availableDay → 400 **[RF4]**; DTO: availableDay 0/31/1.5 bị từ chối, shippingFee âm/vượt trần bị từ chối.
- Cài đặt: DTO create (`shippingFee` `@IsOptional @IsInt @Min(0) @Max`; `availableDay` `@IsOptional @IsInt @Min(1) @Max(30)`), DTO update (`shippingFee` nullable; `availableDay` khai để từ chối có thông điệp — hoặc ném ở use case), create use case (validate, `buildPostDetails` WANTED thêm `availableDay`, ngày theo `wantedLifecycleDates`), update use case (validate, xoá phí khi đổi hình thức).

### Task 4: tài liệu + kiểm toàn bộ
- `docs/API.md` (body tạo/sửa bài, vòng đời WANTED), `docs/FEATURES.md`, `docs/DATABASE.md`, SRS chỗ "7 + 30 ngày" cho WANTED.
- Build, toàn bộ test core/core-lib, lint, format, typecheck:checks; DB: `test:seed-full`, `test:post-status`, `test:lifecycle`, `test:acceptance`, `test:selection`, `test:handover`.
- Review độc lập (đọc working tree).
