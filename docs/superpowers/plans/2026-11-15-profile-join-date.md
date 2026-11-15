# Profile Join Date Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Return the account creation timestamp as `createdAt` ("Ngày tham gia") from both `GET /profile/me` and `GET /profile/:username`.

**Architecture:** Add the existing `IUserEntity.createdAt` field to both profile response contracts and their Swagger DTOs. The own-profile path receives it via the existing shared mapper; the public-profile path maps it explicitly alongside its public profile fields.

**Tech Stack:** TypeScript 5.7, NestJS 11, Jest, Swagger decorators, TypeORM entity timestamps.

**Spec:** `docs/superpowers/specs/2026-11-15-profile-join-date-design.md`

## Global Constraints

- Preserve the existing response envelope: `{ profile: { ... } }`.
- Expose the exact account creation timestamp under the JSON key `createdAt` in both responses.
- Document the field as “Ngày tham gia” in Swagger.
- Preserve profile privacy boundaries; `createdAt` is public for `/profile/:username` and contains no sensitive fields.
- Use the existing `IUserEntity.createdAt`; do not introduce schema or migration changes.

## Review Focus

- A user’s `createdAt` must pass through unchanged (same `Date` value) rather than being replaced by the request time.
- `/profile/me` must expose `createdAt` alongside owner-only data without removing existing fields.
- `/profile/:username` must expose `createdAt` without leaking owner-only fields such as email or phone.
- Shared DTO interfaces and concrete Swagger DTOs must agree, so OpenAPI includes the field on both endpoints.
- Existing test fixtures lacking `createdAt` should only be updated where exact response equality requires the new required field.

---

### Task 1: Extend profile contracts and API schemas

**Files:**
- Modify: `suites/chantam.vn/chantam/core-lib/src/dto/profile/profile.dto.ts:89-183`
- Modify: `suites/chantam.vn/chantam/core/src/infrastructure/controller/dto/profile/profile.dto.ts:225-378`
- Modify: `suites/chantam.vn/chantam/core/src/infrastructure/controller/dto/profile/public-profile.dto.ts:44-110`

**Interfaces:**
- Produces: `IOwnProfileDto.createdAt: Date` and `IPublicProfileDto.createdAt: Date`.
- Produces: documented `createdAt: Date` properties on `OwnProfileDto` and `PublicProfileDto` with Swagger `date-time` format and Vietnamese description “Ngày tham gia”.

- [ ] **Step 1: Add response-contract expectations to the owner and public profile tests**

Extend the exact expected `profile` response in `get-own-profile.use-case.spec.ts` and `get-public-profile.use-case.spec.ts` with a shared fixture timestamp:

```typescript
createdAt: JoinedAt,
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npm run test -- src/application/implementations/profile/get-own-profile.use-case.spec.ts src/application/implementations/profile/get-public-profile.use-case.spec.ts`

Expected: FAIL because both responses omit the required `createdAt` property.

- [ ] **Step 3: Add `createdAt: Date` to `IOwnProfileDto` and `IPublicProfileDto`, then document it on both concrete Swagger DTOs**

Declare the field immediately after the profile identity fields. Use `@ApiProperty({ type: String, format: 'date-time', description: 'Ngày tham gia.' })` in both API DTO classes.

- [ ] **Step 4: Run TypeScript build for the core library and core service**

Run: `npm run build --workspace=@chantam.vn/chantam.core-lib && npm run build --workspace=@chantam.vn/chantam.core`

Expected: PASS with all interface implementations conforming to the expanded contracts.

### Task 2: Map the persisted join timestamp in both profile use cases

**Files:**
- Modify: `suites/chantam.vn/chantam/core/src/application/implementations/profile/profile.mapper.ts:5-31`
- Modify: `suites/chantam.vn/chantam/core/src/application/implementations/profile/get-public-profile.use-case.ts:89-139`
- Modify: `suites/chantam.vn/chantam/core/src/application/implementations/profile/get-own-profile.use-case.spec.ts:112-176`
- Modify: `suites/chantam.vn/chantam/core/src/application/implementations/profile/get-public-profile.use-case.spec.ts`

**Interfaces:**
- Consumes: `IUserEntity.createdAt: Date`.
- Produces: `toOwnProfileDto(user).createdAt: Date` and `IGetPublicProfileResponseDto.profile.createdAt: Date`.

- [ ] **Step 1: Add a deterministic `JoinedAt` value to each user fixture used by exact profile-response tests**

Use one `new Date('2026-01-15T08:30:00.000Z')` fixture and assert the same object/value is returned by each use case.

- [ ] **Step 2: Run the focused tests to verify they fail after contract/schema-only changes**

Run: `npm run test -- src/application/implementations/profile/get-own-profile.use-case.spec.ts src/application/implementations/profile/get-public-profile.use-case.spec.ts`

Expected: FAIL because response mappers still omit `createdAt`.

- [ ] **Step 3: Add `createdAt: user.createdAt` to `toOwnProfileDto` and the public profile response mapping**

Map directly from the loaded user entity; do not calculate, serialize manually, or query separately.

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: `npm run test -- src/application/implementations/profile/get-own-profile.use-case.spec.ts src/application/implementations/profile/get-public-profile.use-case.spec.ts`

Expected: PASS; both endpoint paths return the fixture join timestamp.

- [ ] **Step 5: Run service test suite and CI-format checks**

Run: `npm run test && npm run lint:check && npm run format:check`

Expected: PASS with no lint or formatting errors. Report any unrelated baseline failures explicitly.

- [ ] **Step 6: Commit the completed change**

```bash
git add suites/chantam.vn/chantam/core-lib/src/dto/profile/profile.dto.ts suites/chantam.vn/chantam/core/src/application/implementations/profile suites/chantam.vn/chantam/core/src/infrastructure/controller/dto/profile
git commit -m "feat(profile): return account join date"
```

Include the required Claude co-author trailer.

## Self-Review

- **Spec coverage:** Both requested endpoints receive `profile.createdAt`; contract, implementation, Swagger, and regression tests are covered.
- **Step scan:** Each step has one observable purpose: specify failing response behavior, extend contracts/schema, map stored data, then verify.
- **Type consistency:** The same property name and `Date` type (`createdAt`) is used in contracts, concrete DTOs, mapper, public mapping, and tests.
- **Review focus:** Timestamp pass-through, profile-path parity, privacy, OpenAPI schema alignment, and fixture breakage each have explicit implementation/test coverage.
- **Proportion:** Two tasks mirror the two boundaries: response contract/schema and data mapping/test proof.
