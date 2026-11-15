/**
 * Banner Tài Trợ / Quảng Cáo trên Postgres THẬT (SRS UC-ADM-06, F65 phân hệ 3).
 *
 * ## Năm điều chỉ Postgres trả lời được
 *
 * 1. **Khung thời gian quyết định banner có chạy hay không.** `findServing` so với `now()`
 *    của DATABASE, không phải giờ máy Node. Mock không kiểm được mệnh đề `WHERE`.
 * 2. **`count = count + 1` không mất lượt khi song song.** Nhóm 4 bắn nhiều lượt cộng cùng
 *    lúc rồi đếm lại — đây đúng là lớp lỗi mà đọc-rồi-ghi gây ra, và nó chỉ hiện khi có
 *    nhiều kết nối thật.
 * 3. **Ràng duộc `CHK_sponsor_banners_target_url` chặn `javascript:`.** Một banner do đối
 *    tác gửi là đúng nơi để thử chèn mã, và chỉ cần một WebView cấu hình lỏng là nó chạy.
 * 4. **`recordClick` không cộng cho banner đã hết hạn.** Mệnh đề `ServingFilter` trong câu
 *    `UPDATE`, không phải một nhánh `if`.
 * 5. **Câu đếm và câu đọc của `listForAdmin` dùng chung bộ lọc.** Hai bản lọc lệch nhau là
 *    Admin thấy "12 banner" rồi nhận về 8 hàng — và lệch đó chỉ hiện khi có dữ liệu thật.
 *
 * ## Những phép kiểm đi qua use case THẬT
 *
 * Nhóm 1, 2, 5, 6 dựng use case thật với `AdminConfigRepository` thật, nên quyền
 * `banner.manage` phải thực sự được seed ở migration `1798600000000` — không mock
 * `hasPermission`. Bài học từ `blog.check.ts`: một script tự gọi hộ phần cần kiểm thì xanh
 * mà không kiểm gì.
 */
import { BannerPlacements } from '@chantam.vn/chantam.core-lib/models';
import { resolveAllEntities } from '@chantam/service.persistency-lib';
import { config as loadEnvFile } from 'dotenv';
import { DataSource } from 'typeorm';
import {
  CreateSponsorBannerUseCase,
  DeleteSponsorBannerUseCase,
  ListAdminSponsorBannersUseCase,
  RecordBannerClickUseCase,
  ServeSponsorBannersUseCase,
  SetSponsorBannerActiveUseCase,
  UpdateSponsorBannerUseCase,
} from '../src/application/implementations/sponsor-banner/sponsor-banner.use-cases';
import * as entities from '../src/infrastructure/entity';
import * as migrations from '../src/infrastructure/persistence/migrations';
import { AdminConfigRepository } from '../src/infrastructure/repository/admin-config.repository';
import { SponsorBannerRepository } from '../src/infrastructure/repository/sponsor-banner.repository';

loadEnvFile({ path: '.env.local' });
loadEnvFile();

const ScratchDatabase = 'chantam_banner_check';

const AdminId = 'd1000000-0000-4000-8000-0000000000ad';
const OutsiderId = 'd1000000-0000-4000-8000-0000000000ff';

const failures: string[] = [];

function check(label: string, ok: boolean, detail = ''): void {
  console.log(
    `  ${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`,
  );
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

async function expectThrow(
  label: string,
  run: () => Promise<unknown>,
  expectedName: string,
): Promise<void> {
  try {
    await run();
    check(label, false, 'không ném gì');
  } catch (error) {
    const name = (error as Error).constructor.name;
    check(label, name === expectedName, `ném ${name}`);
  }
}

async function expectReject(
  label: string,
  run: () => Promise<unknown>,
  fragment: string,
): Promise<void> {
  try {
    await run();
    check(label, false, 'không ném gì — ràng buộc không chặn');
  } catch (error) {
    const message = (error as Error).message;
    check(label, message.includes(fragment), message.slice(0, 110));
  }
}

const Hour = 3_600_000;

function bannerInput(overrides: Record<string, unknown> = {}) {
  const startsAt = new Date(Date.now() - Hour);
  return {
    partnerName: 'Công ty TNHH An Lạc',
    partnerContact: 'lienhe@anlac.vn',
    title: 'Mùa Vu Lan An Lạc',
    imageUrl: 'https://cdn.chantam.vn/banners/vu-lan.jpg',
    targetUrl: 'https://anlac.vn/vu-lan',
    placement: 'HOME_HERO',
    displayOrder: 1,
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + 30 * 24 * Hour).toISOString(),
    ...overrides,
  };
}

async function main(): Promise<void> {
  const baseUri = process.env.DATABASE_URI;
  if (!baseUri) throw new Error('Thiếu DATABASE_URI.');

  const adminUri = baseUri.replace(/\/[^/?]+(\?|$)/, '/postgres$1');
  const scratchUri = baseUri.replace(/\/[^/?]+(\?|$)/, `/${ScratchDatabase}$1`);

  const opened: DataSource[] = [];
  const admin = new DataSource({ type: 'postgres', url: adminUri });
  await admin.initialize();
  opened.push(admin);
  await admin.query(`DROP DATABASE IF EXISTS ${ScratchDatabase}`);
  await admin.query(`CREATE DATABASE ${ScratchDatabase}`);

  const dataSource = new DataSource({
    type: 'postgres',
    url: scratchUri,
    entities: resolveAllEntities(entities),
    migrations: resolveAllEntities(migrations),
    migrationsTableName: 'migrations',
    extra: { max: 10 },
  });
  await dataSource.initialize();
  opened.push(dataSource);
  await dataSource.runMigrations();
  console.log('Đã dựng schema trên database nháp\n');

  try {
    const repository = new SponsorBannerRepository(dataSource.manager);
    const adminConfig = new AdminConfigRepository(dataSource.manager);

    const createUseCase = new CreateSponsorBannerUseCase(
      repository,
      adminConfig,
    );
    const updateUseCase = new UpdateSponsorBannerUseCase(
      repository,
      adminConfig,
    );
    const listUseCase = new ListAdminSponsorBannersUseCase(
      repository,
      adminConfig,
    );
    const setActiveUseCase = new SetSponsorBannerActiveUseCase(
      repository,
      adminConfig,
    );
    const deleteUseCase = new DeleteSponsorBannerUseCase(
      repository,
      adminConfig,
    );
    const serveUseCase = new ServeSponsorBannersUseCase(repository);
    const clickUseCase = new RecordBannerClickUseCase(repository);

    for (const [id, username] of [
      [AdminId, 'quantri'],
      [OutsiderId, 'nguoingoaicuoc'],
    ])
      await dataSource.query(
        `INSERT INTO users (global_id, username, password_hash, rank, status)
         VALUES ($1, $2, 'x', 'MEMBER', 'ACTIVE')`,
        [id, username],
      );

    // Gắn vai SUPER_ADMIN. KHÔNG tự chèn quyền bằng tay — nếu migration
    // `1798600000000` cấp thiếu thì nhóm 1 phải ĐỎ, vì lên production nó cũng thiếu y vậy.
    await dataSource.query(
      `INSERT INTO admin_user_roles (user_id, role_id)
       SELECT $1, id FROM admin_roles WHERE code = 'SUPER_ADMIN'`,
      [AdminId],
    );

    console.log('1. Quyền banner.* phải thực sự được seed');

    check(
      'SUPER_ADMIN có banner.manage (migration 1798600000000 cấp tay)',
      await adminConfig.hasPermission(AdminId, 'banner.manage'),
    );
    check(
      'SUPER_ADMIN có banner.read',
      await adminConfig.hasPermission(AdminId, 'banner.read'),
    );
    check(
      'CAMPAIGN_MANAGER được cấp banner.manage',
      (
        await dataSource.query<{ total: string }[]>(
          `SELECT count(*)::text AS total
             FROM admin_role_permissions link
             JOIN admin_roles role ON role.id = link.role_id
             JOIN admin_permissions permission ON permission.id = link.permission_id
            WHERE role.code = 'CAMPAIGN_MANAGER' AND permission.code = 'banner.manage'`,
        )
      )[0].total === '1',
    );
    check(
      'POLICY_ADMIN KHÔNG được cấp banner.manage (cố ý)',
      (
        await dataSource.query<{ total: string }[]>(
          `SELECT count(*)::text AS total
             FROM admin_role_permissions link
             JOIN admin_roles role ON role.id = link.role_id
             JOIN admin_permissions permission ON permission.id = link.permission_id
            WHERE role.code = 'POLICY_ADMIN' AND permission.code = 'banner.manage'`,
        )
      )[0].total === '0',
    );
    check(
      'AUDITOR chỉ có banner.read, không có banner.manage',
      (
        await dataSource.query<{ codes: string }[]>(
          `SELECT coalesce(string_agg(permission.code, ',' ORDER BY permission.code), '') AS codes
             FROM admin_role_permissions link
             JOIN admin_roles role ON role.id = link.role_id
             JOIN admin_permissions permission ON permission.id = link.permission_id
            WHERE role.code = 'AUDITOR' AND permission.code LIKE 'banner.%'`,
        )
      )[0].codes === 'banner.read',
    );

    // Canh chính GIẢ ĐỊNH ở trên. Bản đầu của migration `1798600000000` cấp `banner.read`
    // cho một vai tên `VIEWER` — mà `VIEWER` là một HẠNG người dùng, không phải vai Admin.
    // Câu `INSERT ... SELECT` với `role.code` không tồn tại chèn 0 hàng và **báo thành công**, nên
    // một dòng seed vô nghĩa sẽ nằm lại mãi mãi. Phép kiểm này làm danh sách vai thành thứ kiểm
    // được, thay vì một điều ai cũng tưởng mình nhộ.
    check(
      'danh sách vai Admin đúng như giả định — KHÔNG có vai nào tên VIEWER',
      (
        await dataSource.query<{ codes: string }[]>(
          `SELECT string_agg(code, ',' ORDER BY code) AS codes FROM admin_roles`,
        )
      )[0].codes ===
        'AUDITOR,CAMPAIGN_MANAGER,MODERATOR,POLICY_ADMIN,SUPER_ADMIN',
      (
        await dataSource.query<{ codes: string }[]>(
          `SELECT string_agg(code, ',' ORDER BY code) AS codes FROM admin_roles`,
        )
      )[0].codes,
    );

    await expectThrow(
      'Người không có quyền tạo banner -> ForbiddenException',
      () =>
        createUseCase.handle({
          ...bannerInput(),
          actorUserId: OutsiderId,
        }),
      'ForbiddenException',
    );

    console.log('\n2. Tạo banner — Phase 1 vào thẳng APPROVED (UC-POST-04)');

    const live = await createUseCase.handle({
      ...bannerInput(),
      actorUserId: AdminId,
    });
    check(
      'Admin tạo -> APPROVED ngay, approvedBy là chính họ',
      live.approvalStatus === 'APPROVED' &&
        live.approvedBy === AdminId &&
        live.approvedAt !== null,
      live.approvalStatus,
    );
    check(
      'Số liệu khởi điểm là 0 và clickThroughRate là null, KHÔNG phải 0',
      live.impressionCount === 0 &&
        live.clickCount === 0 &&
        live.clickThroughRate === null,
      `ctr=${String(live.clickThroughRate)}`,
    );

    // Banner CHƯA tới giờ và banner ĐÃ hết giờ — cả hai đều không được phục vụ.
    const future = await createUseCase.handle({
      ...bannerInput({
        title: 'Chưa tới giờ',
        startsAt: new Date(Date.now() + 10 * Hour).toISOString(),
        endsAt: new Date(Date.now() + 20 * Hour).toISOString(),
        displayOrder: 2,
      }),
      actorUserId: AdminId,
    });
    const expired = await createUseCase.handle({
      ...bannerInput({
        title: 'Đã hết hợp đồng',
        startsAt: new Date(Date.now() - 20 * Hour).toISOString(),
        endsAt: new Date(Date.now() - 10 * Hour).toISOString(),
        displayOrder: 3,
      }),
      actorUserId: AdminId,
    });
    // Vị trí khác — không được lẫn vào dải HOME_HERO.
    const otherPlacement = await createUseCase.handle({
      ...bannerInput({ title: 'Trang Công đức', placement: 'MERIT_PAGE' }),
      actorUserId: AdminId,
    });

    console.log('\n2b. Vị trí mới của Khám phá và Phật Pháp (PR #46 §13)');
    const [constraint] = await dataSource.query<{ definition: string }[]>(
      `SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
        WHERE conname = 'CHK_sponsor_banners_placement'`,
    );
    const allowedInDb = [...constraint.definition.matchAll(/'([A-Z_]+)'/g)].map(
      (match) => match[1],
    );
    check(
      'CHECK ở database khớp đúng BannerPlacements ở core-lib',
      JSON.stringify([...allowedInDb].sort()) ===
        JSON.stringify([...BannerPlacements].sort()),
      allowedInDb.join(','),
    );
    const forum = await createUseCase.handle({
      ...bannerInput({
        title: 'Diễn đàn Phật Pháp',
        placement: 'DHARMA_FORUM',
      }),
      actorUserId: AdminId,
    });
    const forumServed = await serveUseCase.handle({
      placement: 'DHARMA_FORUM',
      limit: 10,
    });
    const homeServed = await serveUseCase.handle({
      placement: 'DHARMA_HOME',
      limit: 10,
    });
    check(
      'banner DHARMA_FORUM phục vụ ở đúng vị trí đó, không lẫn sang DHARMA_HOME',
      forumServed.banners.length === 1 &&
        forumServed.banners[0].globalId === forum.globalId &&
        homeServed.banners.length === 0,
    );
    await dataSource.query(`DELETE FROM sponsor_banners WHERE global_id = $1`, [
      forum.globalId,
    ]);

    console.log('\n3. Chỉ banner ĐANG trong khung giờ được phục vụ');

    const served = await serveUseCase.handle({
      placement: 'HOME_HERO',
      limit: 10,
    });
    check(
      'đúng MỘT banner HOME_HERO được phục vụ',
      served.banners.length === 1 &&
        served.banners[0].globalId === live.globalId,
      `${served.banners.length} banner`,
    );
    check(
      'banner chưa tới giờ KHÔNG được phục vụ',
      !served.banners.some((item) => item.globalId === future.globalId),
    );
    check(
      'banner đã hết hợp đồng KHÔNG được phục vụ',
      !served.banners.some((item) => item.globalId === expired.globalId),
    );
    check(
      'banner vị trí khác KHÔNG lẫn vào dải này',
      !served.banners.some((item) => item.globalId === otherPlacement.globalId),
    );
    check(
      'bộ trường công khai KHÔNG có số liệu và liên hệ đối tác',
      !('impressionCount' in served.banners[0]) &&
        !('clickCount' in served.banners[0]) &&
        !('partnerContact' in served.banners[0]) &&
        served.banners[0].partnerName.length > 0,
      Object.keys(served.banners[0]).join(','),
    );

    console.log(
      '\n4. Cột đếm cộng trong database, không mất lượt khi song song',
    );

    const afterFirstServe = await repository.findByGlobalId(live.globalId);
    check(
      'một lượt phục vụ cộng đúng một lượt hiển thị',
      afterFirstServe?.impressionCount === 1,
      `impressions=${afterFirstServe?.impressionCount}`,
    );

    // Hai mươi lượt phục vụ SONG SONG. Đọc-rồi-ghi ở tầng ứng dụng sẽ mất lượt ở đây.
    const Parallel = 20;
    await Promise.all(
      Array.from({ length: Parallel }, () =>
        serveUseCase.handle({ placement: 'HOME_HERO', limit: 10 }),
      ),
    );
    const afterParallel = await repository.findByGlobalId(live.globalId);
    check(
      `${Parallel} lượt phục vụ song song cộng đủ ${Parallel} lượt, không mất lượt nào`,
      afterParallel?.impressionCount === 1 + Parallel,
      `impressions=${afterParallel?.impressionCount}, mong ${1 + Parallel}`,
    );

    const clicked = await clickUseCase.handle({ bannerId: live.globalId });
    check(
      'lượt bấm trả targetUrl từ server',
      clicked.targetUrl === 'https://anlac.vn/vu-lan',
      clicked.targetUrl,
    );
    const afterClick = await repository.findByGlobalId(live.globalId);
    check(
      'CTR tính hai chữ số thập phân, không làm tròn về 0%',
      afterClick?.clickThroughRate === 4.76,
      `ctr=${String(afterClick?.clickThroughRate)} (1/${afterClick?.impressionCount})`,
    );

    await expectThrow(
      'bấm banner ĐÃ hết hợp đồng -> NotServing, và không cộng số',
      () => clickUseCase.handle({ bannerId: expired.globalId }),
      'SponsorBannerNotServingException',
    );
    check(
      'banner hết hợp đồng vẫn có clickCount = 0',
      (await repository.findByGlobalId(expired.globalId))?.clickCount === 0,
    );

    console.log('\n5. Tắt banner và xoá mềm');

    await setActiveUseCase.handle({
      actorUserId: AdminId,
      bannerId: live.globalId,
      isActive: false,
    });
    check(
      'tắt banner -> rời khỏi đường phục vụ ngay',
      (await serveUseCase.handle({ placement: 'HOME_HERO', limit: 10 })).banners
        .length === 0,
    );
    const afterDisable = await repository.findByGlobalId(live.globalId);
    check(
      'tắt banner KHÔNG xoá số liệu đã tích',
      afterDisable?.impressionCount === 1 + Parallel &&
        afterDisable?.clickCount === 1,
      `impressions=${afterDisable?.impressionCount} clicks=${afterDisable?.clickCount}`,
    );

    await deleteUseCase.handle({
      actorUserId: AdminId,
      bannerId: otherPlacement.globalId,
    });
    const [deletedRow] = await dataSource.query<
      { deleted_at: Date | null; impression_count: string }[]
    >(
      `SELECT deleted_at, impression_count FROM sponsor_banners WHERE global_id = $1`,
      [otherPlacement.globalId],
    );
    check(
      'xoá là xoá MỀM — hàng còn đó, số liệu còn đó',
      deletedRow !== undefined && deletedRow.deleted_at !== null,
      JSON.stringify(deletedRow),
    );
    await expectThrow(
      'xoá lần hai -> NotFound',
      () =>
        deleteUseCase.handle({
          actorUserId: AdminId,
          bannerId: otherPlacement.globalId,
        }),
      'SponsorBannerNotFoundException',
    );

    console.log('\n6. Sửa banner');

    const patched = await updateUseCase.handle({
      actorUserId: AdminId,
      bannerId: live.globalId,
      title: 'Tên mới',
    });
    check(
      'sửa một trường không đụng các trường khác',
      patched.title === 'Tên mới' &&
        patched.partnerName === 'Công ty TNHH An Lạc' &&
        patched.displayOrder === 1,
      `${patched.title}/${patched.partnerName}`,
    );
    const beforeNoop = await repository.findByGlobalId(live.globalId);
    const noop = await updateUseCase.handle({
      actorUserId: AdminId,
      bannerId: live.globalId,
    });
    check(
      'không gửi gì thì KHÔNG đụng updatedAt',
      noop.updatedAt.getTime() === beforeNoop?.updatedAt.getTime(),
      `${noop.updatedAt.toISOString()} vs ${beforeNoop?.updatedAt.toISOString()}`,
    );
    await expectThrow(
      'sửa banner không tồn tại -> NotFound',
      () =>
        updateUseCase.handle({
          actorUserId: AdminId,
          bannerId: '00000000-0000-4000-8000-000000000000',
          title: 'x',
        }),
      'SponsorBannerNotFoundException',
    );

    console.log('\n7. Ràng buộc database — lớp cuối chặn SQL tay');

    await expectReject(
      'targetUrl lược đồ javascript: bị chặn',
      () =>
        dataSource.query(
          `INSERT INTO sponsor_banners
             (partner_name, title, image_url, target_url, placement, starts_at, ends_at)
           VALUES ('Đối tác', 'Thử', 'https://cdn.chantam.vn/a.jpg',
                   'javascript:alert(1)', 'HOME_HERO', now(), now() + interval '1 day')`,
        ),
      'CHK_sponsor_banners_target_url',
    );
    // Cả hai tên lược đồ deep link lọt qua CHECK cho tới khi mobile chốt (CMS B7).
    for (const scheme of ['chantam://', 'givingapp://']) {
      const [inserted] = await dataSource.query<{ target_url: string }[]>(
        `INSERT INTO sponsor_banners
           (partner_name, title, image_url, target_url, placement, starts_at, ends_at)
         VALUES ('Đối tác', 'Thử lược đồ', 'https://cdn.chantam.vn/a.jpg',
                 $1, 'HOME_HERO', now(), now() + interval '1 day')
         RETURNING target_url`,
        [`${scheme}campaigns/vu-lan`],
      );
      check(
        `targetUrl ${scheme} được nhận`,
        inserted?.target_url === `${scheme}campaigns/vu-lan`,
      );
    }
    await expectReject(
      'javascript: chứa chantam:// ở giữa vẫn bị chặn',
      () =>
        dataSource.query(
          `INSERT INTO sponsor_banners
             (partner_name, title, image_url, target_url, placement, starts_at, ends_at)
           VALUES ('Đối tác', 'Thử', 'https://cdn.chantam.vn/a.jpg',
                   'javascript:alert("chantam://x")', 'HOME_HERO', now(), now() + interval '1 day')`,
        ),
      'CHK_sponsor_banners_target_url',
    );
    await expectReject(
      'imageUrl qua http bị chặn',
      () =>
        dataSource.query(
          `INSERT INTO sponsor_banners
             (partner_name, title, image_url, target_url, placement, starts_at, ends_at)
           VALUES ('Đối tác', 'Thử', 'http://cdn.chantam.vn/a.jpg',
                   'https://doitac.vn', 'HOME_HERO', now(), now() + interval '1 day')`,
        ),
      'CHK_sponsor_banners_image_url',
    );
    await expectReject(
      'vị trí ngoài allowlist bị chặn',
      () =>
        dataSource.query(
          `INSERT INTO sponsor_banners
             (partner_name, title, image_url, target_url, placement, starts_at, ends_at)
           VALUES ('Đối tác', 'Thử', 'https://cdn.chantam.vn/a.jpg',
                   'https://doitac.vn', 'trang-chu', now(), now() + interval '1 day')`,
        ),
      'CHK_sponsor_banners_placement',
    );
    await expectReject(
      'endsAt không sau startsAt bị chặn',
      () =>
        dataSource.query(
          `INSERT INTO sponsor_banners
             (partner_name, title, image_url, target_url, placement, starts_at, ends_at)
           VALUES ('Đối tác', 'Thử', 'https://cdn.chantam.vn/a.jpg',
                   'https://doitac.vn', 'HOME_HERO', now(), now() - interval '1 hour')`,
        ),
      'CHK_sponsor_banners_window',
    );
    await expectReject(
      'partnerName chỉ gồm dấu cách bị chặn',
      () =>
        dataSource.query(
          `INSERT INTO sponsor_banners
             (partner_name, title, image_url, target_url, placement, starts_at, ends_at)
           VALUES ('   ', 'Thử', 'https://cdn.chantam.vn/a.jpg',
                   'https://doitac.vn', 'HOME_HERO', now(), now() + interval '1 day')`,
        ),
      'CHK_sponsor_banners_partner_name',
    );
    await expectReject(
      'APPROVED mà thiếu approved_at bị chặn',
      () =>
        dataSource.query(
          `INSERT INTO sponsor_banners
             (partner_name, title, image_url, target_url, placement, starts_at, ends_at,
              approval_status)
           VALUES ('Đối tác', 'Thử', 'https://cdn.chantam.vn/a.jpg',
                   'https://doitac.vn', 'HOME_HERO', now(), now() + interval '1 day',
                   'APPROVED')`,
        ),
      'CHK_sponsor_banners_approved_at',
    );
    await expectReject(
      'số đếm âm bị chặn',
      () =>
        dataSource.query(
          `UPDATE sponsor_banners SET click_count = -1 WHERE global_id = $1`,
          [live.globalId],
        ),
      'CHK_sponsor_banners_counts',
    );

    console.log('\n8. listForAdmin — câu đếm và câu đọc dùng chung bộ lọc');

    const allPage = await listUseCase.handle({
      actorUserId: AdminId,
      limit: 2,
      offset: 0,
    });
    const [liveRows] = await dataSource.query<{ total: string }[]>(
      `SELECT count(*)::text AS total FROM sponsor_banners WHERE deleted_at IS NULL`,
    );
    check(
      'total là TỔNG sau lọc, không phải số hàng của trang',
      String(allPage.total) === liveRows.total && allPage.items.length === 2,
      `total=${allPage.total} items=${allPage.items.length} thật=${liveRows.total}`,
    );
    check(
      'banner đã xoá mềm KHÔNG vào danh sách Admin',
      !allPage.items.some(
        (item) => item.globalId === otherPlacement.globalId,
      ) && String(allPage.total) === liveRows.total,
    );

    const heroPage = await listUseCase.handle({
      actorUserId: AdminId,
      limit: 50,
      offset: 0,
      placement: 'HOME_HERO',
    });
    check(
      'lọc theo vị trí: total khớp số hàng trả về',
      heroPage.total === heroPage.items.length &&
        heroPage.items.every((item) => item.placement === 'HOME_HERO'),
      `total=${heroPage.total} items=${heroPage.items.length}`,
    );

    await expectThrow(
      'người không có banner.read gọi danh sách -> ForbiddenException',
      () =>
        listUseCase.handle({ actorUserId: OutsiderId, limit: 10, offset: 0 }),
      'ForbiddenException',
    );
    await runCampaignPromotionChecks(dataSource, repository);
  } finally {
    for (const source of opened.reverse())
      if (source.isInitialized) await source.destroy();
  }

  console.log(
    `\n${
      failures.length === 0
        ? 'F65 Quảng cáo: quyền banner.* seed đúng bốn vai (và POLICY_ADMIN cố ý không có), chỉ banner trong khung giờ được phục vụ, 20 lượt cộng song song không mất lượt nào, CTR hai chữ số thập phân, bấm banner hết hợp đồng không cộng số, xoá là xoá mềm giữ nguyên số liệu, bảy ràng buộc database chặn đúng gồm javascript: và vị trí ngoài allowlist, và câu đếm của listForAdmin khớp câu đọc'
        : `${failures.length} phép kiểm thất bại`
    }`,
  );
  if (failures.length > 0) {
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
  }
}

/**
 * Nhóm 9 — đề xuất chiến dịch lên trang chủ (15/11). Chỉ Postgres trả lời được: khoá
 * `FOR UPDATE` giữ mốc khi hai lượt gửi song song, `EXISTS` ẩn banner khi chiến dịch đóng,
 * và `date_trunc` khiến `expectedUpdatedAt` so khớp được với `updated_at` micro giây.
 */
async function runCampaignPromotionChecks(
  dataSource: DataSource,
  repository: SponsorBannerRepository,
): Promise<void> {
  console.log('\n9. Đề xuất chiến dịch lên trang chủ');

  const OwnerId = 'd1000000-0000-4000-8000-0000000000c1';
  const ApproverId = AdminId;
  await dataSource.query(
    `INSERT INTO users (global_id, username, password_hash, rank, status, full_name)
     VALUES ($1, 'chuchiendich', 'x', 'MEMBER', 'ACTIVE', 'Chủ Chiến Dịch')`,
    [OwnerId],
  );

  async function insertCampaign(slug: string): Promise<string> {
    const [row] = await dataSource.query<{ global_id: string }[]>(
      `INSERT INTO campaigns (title, slug, description, banner_url, badge_name,
                              start_time, end_time, created_by, approval_status, approved_at)
       VALUES ($1, $2, 'Mô tả đủ mười ký tự.', 'https://cdn.chantam.vn/a.jpg', 'Huy hiệu',
               now() - interval '1 day', now() + interval '10 days', $3, 'APPROVED', now())
       RETURNING global_id`,
      [`Áo ấm ${slug}`, slug, OwnerId],
    );
    return row.global_id;
  }

  const campaignId = await insertCampaign('ao-am-vung-cao');
  const otherCampaignId = await insertCampaign('chien-dich-khac');

  const promotion = (overrides: Record<string, unknown> = {}) => ({
    campaignId,
    requestedBy: OwnerId,
    partnerName: 'Áo ấm ao-am-vung-cao',
    title: 'Chung tay áo ấm vùng cao',
    imageUrl: 'https://cdn.chantam.vn/promo.jpg',
    targetUrl: `chantam://campaign/${campaignId}`,
    placement: 'HOME_INLINE' as const,
    displayType: 'BANNER' as const,
    displayOrder: 1,
    startsAt: new Date(Date.now() - Hour),
    endsAt: new Date(Date.now() + 24 * Hour),
    maxOpen: 3,
    ...overrides,
  });

  const created = await repository.createCampaignPromotion(promotion());
  check(
    'đề xuất mới vào PENDING_APPROVAL, nguồn CAMPAIGN, có người đề xuất',
    created.kind === 'CREATED' &&
      created.banner.approvalStatus === 'PENDING_APPROVAL' &&
      created.banner.sourceType === 'CAMPAIGN' &&
      created.banner.sourceId === campaignId &&
      created.banner.requestedBy === OwnerId,
    created.kind,
  );
  if (created.kind !== 'CREATED') return;
  const first = created.banner;

  const servingIds = async () =>
    (await repository.findServing({ placement: 'HOME_INLINE', limit: 20 })).map(
      (banner) => banner.globalId,
    );
  check(
    'chưa duyệt thì không được phục vụ',
    !(await servingIds()).includes(first.globalId),
  );

  // Duyệt với mốc `updatedAt` mà Admin đã thấy — phải khớp dù Postgres giữ micro giây.
  const approved = await repository.decideApproval({
    bannerId: first.globalId,
    approverId: ApproverId,
    approve: true,
    note: null,
    expectedUpdatedAt: first.updatedAt,
  });
  check(
    'duyệt với expectedUpdatedAt vừa đọc -> DECIDED (so ở độ phân giải mili giây)',
    approved.kind === 'DECIDED',
    approved.kind,
  );
  check(
    'duyệt xong là chạy luôn',
    (await servingIds()).includes(first.globalId),
  );

  await dataSource.query(
    `UPDATE campaigns SET is_active = false WHERE global_id = $1`,
    [campaignId],
  );
  check(
    '[RF2] chiến dịch đóng -> banner rời findServing',
    !(await servingIds()).includes(first.globalId),
  );
  check(
    '[RF2] chiến dịch đóng -> recordClick không cộng',
    (await repository.recordClick(first.globalId)) === false,
  );
  const whileClosed = await repository.createCampaignPromotion(promotion());
  check(
    'chiến dịch đóng -> không tạo được đề xuất mới',
    whileClosed.kind === 'NOT_ELIGIBLE',
    whileClosed.kind,
  );
  await dataSource.query(
    `UPDATE campaigns SET is_active = true WHERE global_id = $1`,
    [campaignId],
  );
  check(
    'chiến dịch mở lại -> banner tự hiện lại',
    (await servingIds()).includes(first.globalId),
  );

  // Mốc 3: đã có 1 (đang chạy). Thêm 2 nữa là đủ.
  const second = await repository.createCampaignPromotion(promotion());
  const third = await repository.createCampaignPromotion(promotion());
  const fourth = await repository.createCampaignPromotion(promotion());
  check(
    'mốc 3: lượt thứ tư -> LIMIT_REACHED',
    second.kind === 'CREATED' &&
      third.kind === 'CREATED' &&
      fourth.kind === 'LIMIT_REACHED',
    `${second.kind}/${third.kind}/${fourth.kind}`,
  );
  if (third.kind !== 'CREATED') return;
  const thirdId = third.banner.globalId;

  // Từ chối một đề xuất là trả lại một suất.
  await repository.decideApproval({
    bannerId: thirdId,
    approverId: ApproverId,
    approve: false,
    note: 'Ảnh mờ',
    expectedUpdatedAt: null,
  });
  const afterReject = await repository.createCampaignPromotion(promotion());
  check(
    'từ chối một đề xuất -> tạo được thêm một',
    afterReject.kind === 'CREATED',
    afterReject.kind,
  );

  // Gửi lại đề xuất bị từ chối khi đã đủ 3 đang mở -> chặn.
  const resubmit = await repository.updateCampaignPromotion({
    campaignId,
    promotionId: thirdId,
    changes: { title: 'Ảnh mới rõ hơn' },
    maxOpen: 3,
  });
  check(
    'gửi lại hàng bị từ chối khi đã đủ mốc -> LIMIT_REACHED',
    resubmit.kind === 'LIMIT_REACHED',
    resubmit.kind,
  );
  const resubmitWithRoom = await repository.updateCampaignPromotion({
    campaignId,
    promotionId: thirdId,
    changes: { title: 'Ảnh mới rõ hơn' },
    maxOpen: 4,
  });
  check(
    'gửi lại khi còn suất -> PENDING_APPROVAL, xoá ghi chú và người duyệt',
    resubmitWithRoom.kind === 'UPDATED' &&
      resubmitWithRoom.banner.approvalStatus === 'PENDING_APPROVAL' &&
      resubmitWithRoom.banner.approvalNote === null &&
      resubmitWithRoom.banner.approvedAt === null &&
      resubmitWithRoom.banner.title === 'Ảnh mới rõ hơn',
    resubmitWithRoom.kind,
  );

  // Sửa bản đang chạy -> rời app tới khi duyệt lại.
  const edited = await repository.updateCampaignPromotion({
    campaignId,
    promotionId: first.globalId,
    changes: { displayOrder: 5 },
    maxOpen: 3,
  });
  check(
    'owner sửa bản đã duyệt -> quay về PENDING_APPROVAL và rời findServing',
    edited.kind === 'UPDATED' &&
      edited.banner.approvalStatus === 'PENDING_APPROVAL' &&
      !(await servingIds()).includes(first.globalId),
    edited.kind,
  );

  // Duyệt với mốc cũ sau khi owner sửa -> CHANGED; đã quyết -> ALREADY_DECIDED.
  const stale = await repository.decideApproval({
    bannerId: first.globalId,
    approverId: ApproverId,
    approve: true,
    note: null,
    expectedUpdatedAt: first.updatedAt,
  });
  check(
    'duyệt với expectedUpdatedAt cũ -> CHANGED',
    stale.kind === 'CHANGED',
    stale.kind,
  );
  await repository.decideApproval({
    bannerId: thirdId,
    approverId: ApproverId,
    approve: true,
    note: null,
    expectedUpdatedAt: null,
  });
  const twice = await repository.decideApproval({
    bannerId: thirdId,
    approverId: ApproverId,
    approve: false,
    note: 'muộn',
    expectedUpdatedAt: null,
  });
  check(
    'đã quyết rồi -> ALREADY_DECIDED',
    twice.kind === 'ALREADY_DECIDED',
    twice.kind,
  );

  check(
    '[RF4] id đề xuất gọi qua chiến dịch khác -> null',
    (await repository.findCampaignPromotion(
      otherCampaignId,
      first.globalId,
    )) === null,
  );
  const crossUpdate = await repository.updateCampaignPromotion({
    campaignId: otherCampaignId,
    promotionId: first.globalId,
    changes: { title: 'x' },
    maxOpen: 3,
  });
  check(
    '[RF4] sửa qua chiến dịch khác -> NOT_FOUND',
    crossUpdate.kind === 'NOT_FOUND',
    crossUpdate.kind,
  );

  // [RF1] Hai lượt song song khi còn đúng một suất.
  const raceCampaign = await insertCampaign('dua-suat-cuoi');
  const raceInput = promotion({
    campaignId: raceCampaign,
    targetUrl: `chantam://campaign/${raceCampaign}`,
    maxOpen: 1,
  });
  const raced = await Promise.all([
    repository.createCampaignPromotion(raceInput),
    repository.createCampaignPromotion(raceInput),
  ]);
  check(
    '[RF1] hai lượt gửi song song khi còn 1 suất -> đúng một CREATED',
    raced.filter((outcome) => outcome.kind === 'CREATED').length === 1 &&
      raced.filter((outcome) => outcome.kind === 'LIMIT_REACHED').length === 1,
    raced.map((outcome) => outcome.kind).join('/'),
  );

  const listed = await repository.listByCampaign(campaignId);
  check(
    'listByCampaign chỉ trả đề xuất của chiến dịch đó',
    listed.length >= 4 &&
      listed.every((banner) => banner.sourceId === campaignId),
    `${listed.length}`,
  );

  const adminPage = await repository.listForAdmin({
    limit: 50,
    offset: 0,
    sourceType: 'CAMPAIGN',
    sourceId: campaignId,
  });
  check(
    'listForAdmin lọc theo nguồn + chiến dịch: total khớp, có tên chiến dịch và người đề xuất',
    adminPage.total === adminPage.items.length &&
      adminPage.total === listed.length &&
      adminPage.items.every(
        (item) =>
          item.source?.campaignId === campaignId &&
          item.source.title === 'Áo ấm ao-am-vung-cao' &&
          item.requester?.fullName === 'Chủ Chiến Dịch',
      ),
    `total=${adminPage.total} items=${adminPage.items.length} list=${listed.length}`,
  );
  const sponsoredPage = await repository.listForAdmin({
    limit: 50,
    offset: 0,
    sourceType: 'SPONSORED',
  });
  check(
    '[RF5] banner đối tác: nguồn SPONSORED, không có source/requester',
    sponsoredPage.total > 0 &&
      sponsoredPage.items.every(
        (item) =>
          item.sourceType === 'SPONSORED' &&
          item.source === null &&
          item.requester === null,
      ),
    `${sponsoredPage.total}`,
  );

  await expectReject(
    'CHECK: APP_SPLASH đi với BANNER bị chặn',
    () =>
      dataSource.query(
        `INSERT INTO sponsor_banners
           (partner_name, title, image_url, target_url, placement, starts_at, ends_at,
            display_type)
         VALUES ('Đối tác', 'Thử', 'https://cdn.chantam.vn/a.jpg', 'https://a.vn',
                 'APP_SPLASH', now(), now() + interval '1 day', 'BANNER')`,
      ),
    'CHK_sponsor_banners_splash_fullscreen',
  );
  await expectReject(
    'CHECK: nguồn CAMPAIGN mà thiếu source_id bị chặn',
    () =>
      dataSource.query(
        `INSERT INTO sponsor_banners
           (partner_name, title, image_url, target_url, placement, starts_at, ends_at,
            source_type)
         VALUES ('Đối tác', 'Thử', 'https://cdn.chantam.vn/a.jpg', 'https://a.vn',
                 'HOME_HERO', now(), now() + interval '1 day', 'CAMPAIGN')`,
      ),
    'CHK_sponsor_banners_source_id',
  );
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
