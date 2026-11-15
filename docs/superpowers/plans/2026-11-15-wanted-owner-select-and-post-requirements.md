# Người xin tự chọn người tặng + `requirements` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chủ bài `WANTED` ở mọi hạng chọn tay được người tặng; bài `OFFER`/`WANTED` có trường chuỗi `requirements`.

**Architecture:** Bỏ cổng `SELECT_REQUESTER` cho bài `WANTED` ở hai use case duyệt; `requirements` lưu trong `details` JSONB như các trường riêng theo loại bài khác, nhận qua body tạo/sửa bài.

**Tech Stack:** NestJS 11, TypeScript, class-validator, Jest.

**Spec:** `docs/superpowers/specs/2026-11-15-wanted-owner-select-and-post-requirements-design.md`

## Global Constraints

- Cổng Kim Cương giữ nguyên cho mọi loại bài khác `WANTED`.
- `requirements`: tối đa 500 ký tự; chỉ `OFFER` và `WANTED`; trim, rỗng → `null`; lỗi loại bài: `requirements chỉ áp dụng cho bài OFFER và WANTED`.
- Không migration, không đổi bảng quyền.
- Sửa `core-lib` → `npm run build --workspace=@chantam.vn/chantam.core-lib` trước khi test `core`.
- Lệnh test tập trung: `npm run test --workspace=@chantam.vn/chantam.core -- <paths>`.

## Review Focus

- Người KHÔNG phải chủ bài `WANTED` gọi `batch-accept` không được thành công (repository phải vẫn chặn khi cổng bị bỏ qua).
- Bài `OFFER` dưới Kim Cương gửi lô rỗng vẫn nhận `SELECT_REQUESTER_NOT_ALLOWED`, không phải lỗi validate.
- `requirements` chỉ toàn khoảng trắng phải thành `null`, không lưu chuỗi trắng.
- `PATCH` không gửi `requirements` không được xoá giá trị đã có.
- `requirements` gửi kèm bài CHARITY/CLASSIFIED/MERIT bị 400 cả ở tạo lẫn sửa.

---

### Task 1: Chủ bài WANTED chọn tay ở mọi hạng

**Files:**
- Modify: `suites/chantam.vn/chantam/core/src/application/implementations/gift-request/accept-gift-request.use-case.ts:86-95`
- Modify: `suites/chantam.vn/chantam/core/src/application/implementations/gift-request/batch-accept-requests.use-case.ts:55-97`
- Test: `.../gift-request/accept-gift-request.use-case.spec.ts`, `.../gift-request/batch-accept-requests.use-case.spec.ts`
- Docs: `docs/software-requirement-specification/SRS_Chan_Tam_v1.15.0.md:72`, `docs/API.md` (~740), `docs/FEATURES.md` (~1001)

**Interfaces:** không đổi chữ ký nào.

- [ ] **Step 1: Viết test đỏ**
  - accept: `'chủ bài WANTED dưới Kim Cương vẫn chọn tay được người tặng'` — post `postType: 'WANTED'`, capability `{ allowed: false }` → `acceptRequest` được gọi, kết quả `status: ACCEPTED`, `getCapability` không được gọi.
  - accept: giữ test OFFER bị chặn hiện có (không sửa).
  - batch: `'chủ bài WANTED dưới Kim Cương duyệt lô được'` — post WANTED, capability `{ allowed: false }` → `acceptRequestsBatch` được gọi.
  - batch: `'bài OFFER dưới Kim Cương gửi lô rỗng vẫn bị chặn bởi cổng, không phải lỗi validate'` → ném `SelectRequesterNotAllowedException`.
- [ ] **Step 2: Chạy, xác nhận đỏ đúng lý do** (`SelectRequesterNotAllowedException` ở hai test WANTED).
- [ ] **Step 3: Cài đặt** — accept: bọc khối cổng trong `if (post.postType !== PostTypes.WANTED)`. batch: chuyển đọc bài + `PostNotFoundException` lên đầu `handle`, cổng chạy ngay sau với cùng điều kiện, rồi tới validate lô, rồi `assertClassifiedTransactionsAllowed`. Cập nhật docblock hai file nêu quyết định 15/11.
- [ ] **Step 4: Chạy lại hai spec → xanh.**
- [ ] **Step 5: Cập nhật SRS dòng 72, API.md, FEATURES.md** theo quyết định 15/11 (WANTED: chủ bài mọi hạng chọn tay; tự chọn sau 7 ngày giữ nguyên).

### Task 2: Trường `requirements` cho bài OFFER/WANTED

**Files:**
- Modify: `suites/chantam.vn/chantam/core-lib/src/dto/post/post.dto.ts` (`ICreatePostDto`, `ICreateOfferPostDto`, `ICreateGenericMvpPostDto` nếu cần cho WANTED, `IUpdatePostDto`)
- Modify: `suites/chantam.vn/chantam/core/src/infrastructure/controller/dto/post/create-post.dto.ts`, `update-post.dto.ts`
- Modify: `suites/chantam.vn/chantam/core/src/application/implementations/post/create-post.use-case.ts`, `update-post.use-case.ts`
- Test: `.../post/create-post.use-case.spec.ts`, `.../post/update-post.use-case.spec.ts`, DTO spec nào có danh sách trường cố định (vd `update-post.dto.spec.ts`)
- Docs: `docs/API.md` (body tạo/sửa bài)

**Interfaces:**
- Produces: `requirements?: string | null` trên `ICreatePostDto` và `IUpdatePostDto`; `post.details.requirements: string | null` cho bài OFFER/WANTED tạo mới.

- [ ] **Step 1: Viết test đỏ**
  - create: OFFER với `requirements: '  Ưu tiên sinh viên  '` → `details.requirements === 'Ưu tiên sinh viên'`.
  - create: WANTED không gửi → `details` có khoá `requirements: null`.
  - create: WANTED `requirements: '   '` → `null`.
  - create: CHARITY gửi `requirements` → `ValidationFailedException` với thông điệp ở Global Constraints.
  - update: OFFER `requirements: 'mới'` → `details` merge giữ `condition` cũ, `requirements: 'mới'`.
  - update: `requirements: null` → `details.requirements === null`; không gửi → `details` không đổi (`changes.details` undefined).
  - update: CLASSIFIED gửi `requirements` → 400.
  - DTO: `requirements` 501 ký tự bị class-validator từ chối.
- [ ] **Step 2: Chạy, xác nhận đỏ.**
- [ ] **Step 3: Cài đặt** — thêm trường vào interface `core-lib` và DTO (`@IsOptional() @IsString() @MaxLength(500)`, Swagger `nullable: true`, mô tả "Điều kiện cho/nhận do người đăng tự ghi. Chỉ OFFER và WANTED."). Use case: hàm chuẩn hoá `normalizeRequirements(value: string | null | undefined): string | null | undefined` (undefined giữ nguyên, trim, rỗng → null); validate loại bài; `buildPostDetails` ghi `requirements` cho OFFER và WANTED; update thêm vào `hasDetails` và merge.
- [ ] **Step 4: Build `core-lib`, chạy lại các spec → xanh.**
- [ ] **Step 5: Cập nhật `docs/API.md`.**

### Task 3: Kiểm toàn bộ

- [ ] `npm run build --workspace=@chantam.vn/chantam.core-lib && npm run build --workspace=@chantam.vn/chantam.core`
- [ ] `npm run test --workspace=@chantam.vn/chantam.core` → toàn bộ xanh.
- [ ] `npm run lint:check && npm run format:check` → xanh.
- [ ] Review độc lập toàn bộ diff (gửi kèm patch, không dựa vào worktree tách biệt).
- [ ] Không commit cho tới khi người dùng yêu cầu.
