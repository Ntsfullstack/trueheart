import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Đề xuất chiến dịch lên trang chủ (15/11, thiết kế
 * `docs/superpowers/specs/2026-11-15-campaign-home-promotion-design.md`).
 *
 * Đề xuất CHÍNH LÀ một hàng `sponsor_banners` — không bảng thứ hai, không màn Admin thứ hai.
 * Lượt này thêm bốn cột để biết hàng đó từ đâu ra và app dựng nó thế nào.
 *
 * ## `display_type`: backfill theo vị trí, rồi mới DEFAULT `'BANNER'`
 *
 * Kiểu đúng phụ thuộc vị trí (`HOME_HERO` là dải trượt, `APP_SPLASH` là poster), nên hàng có
 * sẵn được backfill theo vị trí chứ không nhận một DEFAULT. Sau đó cột mới có DEFAULT
 * `'BANNER'` cho các lối INSERT thô cũ (seed, script kiểm ràng buộc): quên cột ở
 * `APP_SPLASH` vẫn bị `CHK_sponsor_banners_splash_fullscreen` chặn, nên DEFAULT không thể sinh
 * ra một poster sai — tệ nhất là một banner `HOME_HERO` dựng dạng `BANNER`. Repository luôn ghi
 * cột này tường minh.
 *
 * ## `source_id` dùng `ON DELETE RESTRICT`
 *
 * CHECK bắt `source_type = 'CAMPAIGN'` ⇔ có `source_id`. `SET NULL` sẽ vi phạm chính CHECK đó.
 * `campaigns` chỉ xoá mềm, nên RESTRICT không chặn luồng nào đang có.
 *
 * Danh sách vị trí viết cứng, không import — migration là ảnh chụp lịch sử (cùng lối
 * `1801900000000`). Phải khớp `BannerPlacements` ở core-lib; `test:banner` so hai bên.
 */
const Previous = [
  'HOME_HERO',
  'HOME_INLINE',
  'POST_LIST',
  'MERIT_PAGE',
  'DISCOVERY_GIVING',
  'DISCOVERY_REQUEST',
  'DISCOVERY_CHARITY',
  'DISCOVERY_CLASSIFIED',
  'DHARMA_HOME',
  'DHARMA_CHANTING',
  'DHARMA_FORUM',
  'DHARMA_MONASTERY',
];
const Next = [...Previous, 'APP_SPLASH'];

const placementCheck = (placements: string[]) =>
  `CHECK ("placement" IN (${placements.map((value) => `'${value}'`).join(', ')}))`;

export class CampaignHomePromotion1803400000000 implements MigrationInterface {
  name = 'CampaignHomePromotion1803400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sponsor_banners"
        ADD COLUMN "source_type" varchar(20) NOT NULL DEFAULT 'SPONSORED',
        ADD COLUMN "source_id" uuid,
        ADD COLUMN "requested_by" uuid,
        ADD COLUMN "display_type" varchar(20)
    `);
    await queryRunner.query(`
      UPDATE "sponsor_banners"
         SET "display_type" = CASE "placement" WHEN 'HOME_HERO' THEN 'SLIDER' ELSE 'BANNER' END
    `);
    await queryRunner.query(`
      ALTER TABLE "sponsor_banners"
        ALTER COLUMN "display_type" SET NOT NULL,
        ALTER COLUMN "display_type" SET DEFAULT 'BANNER'
    `);

    await queryRunner.query(
      `ALTER TABLE "sponsor_banners" DROP CONSTRAINT "CHK_sponsor_banners_placement"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sponsor_banners" ADD CONSTRAINT "CHK_sponsor_banners_placement" ${placementCheck(Next)}`,
    );

    await queryRunner.query(`
      ALTER TABLE "sponsor_banners"
        ADD CONSTRAINT "CHK_sponsor_banners_source_type"
          CHECK ("source_type" IN ('ADMIN', 'CAMPAIGN', 'SPONSORED')),
        ADD CONSTRAINT "CHK_sponsor_banners_source_id"
          CHECK (("source_type" = 'CAMPAIGN') = ("source_id" IS NOT NULL)),
        ADD CONSTRAINT "CHK_sponsor_banners_display_type"
          CHECK ("display_type" IN ('FULLSCREEN', 'BANNER', 'SLIDER', 'INLINE', 'FLOATING')),
        ADD CONSTRAINT "CHK_sponsor_banners_splash_fullscreen"
          CHECK (("placement" = 'APP_SPLASH') = ("display_type" = 'FULLSCREEN')),
        ADD CONSTRAINT "FK_sponsor_banners_source_campaign"
          FOREIGN KEY ("source_id") REFERENCES "campaigns"("global_id") ON DELETE RESTRICT,
        ADD CONSTRAINT "FK_sponsor_banners_requester"
          FOREIGN KEY ("requested_by") REFERENCES "users"("global_id") ON DELETE SET NULL
    `);

    // Phép đếm mốc "đang mở" và danh sách đề xuất của một chiến dịch.
    await queryRunner.query(`
      CREATE INDEX "IDX_sponsor_banners_campaign_source"
        ON "sponsor_banners" ("source_id")
        WHERE "source_type" = 'CAMPAIGN' AND "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      INSERT INTO "system_configs"
        ("config_key", "value_json", "value_type", "version", "status", "change_reason")
      VALUES ('banner.campaign_promotion.max_open_per_campaign', '3', 'INTEGER', 1, 'PUBLISHED',
              'Số đề xuất lên trang chủ đang chờ duyệt hoặc đang chạy tối đa của một hoạt động từ thiện.')
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "system_configs" WHERE "config_key" = 'banner.campaign_promotion.max_open_per_campaign'`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_sponsor_banners_campaign_source"`,
    );
    await queryRunner.query(`
      ALTER TABLE "sponsor_banners"
        DROP CONSTRAINT IF EXISTS "FK_sponsor_banners_requester",
        DROP CONSTRAINT IF EXISTS "FK_sponsor_banners_source_campaign",
        DROP CONSTRAINT IF EXISTS "CHK_sponsor_banners_splash_fullscreen",
        DROP CONSTRAINT IF EXISTS "CHK_sponsor_banners_display_type",
        DROP CONSTRAINT IF EXISTS "CHK_sponsor_banners_source_id",
        DROP CONSTRAINT IF EXISTS "CHK_sponsor_banners_source_type"
    `);
    // Banner đã đặt ở `APP_SPLASH` làm CHECK cũ thất bại — để Postgres từ chối thay vì xoá
    // âm thầm. Đề xuất từ chiến dịch thì mất nguồn khi bỏ cột: ghi rõ đây là lượt lùi có mất mát.
    await queryRunner.query(
      `ALTER TABLE "sponsor_banners" DROP CONSTRAINT "CHK_sponsor_banners_placement"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sponsor_banners" ADD CONSTRAINT "CHK_sponsor_banners_placement" ${placementCheck(Previous)}`,
    );
    await queryRunner.query(`
      ALTER TABLE "sponsor_banners"
        DROP COLUMN "display_type",
        DROP COLUMN "requested_by",
        DROP COLUMN "source_id",
        DROP COLUMN "source_type"
    `);
  }
}
