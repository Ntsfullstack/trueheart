import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phí ship người đăng khai (16/11).
 *
 * Cột riêng cạnh `ship_payer`, cùng luật: chỉ có nghĩa khi `delivery_method = 'GIVER_SHIPS'`
 * — tự đến lấy thì không có phí. Use case đã trả 400 cho trường hợp đó và tự xoá phí khi
 * người đăng đổi sang hình thức khác; CHECK ở đây là lớp cuối cho mọi lối ghi SQL tay.
 *
 * Trần 10 triệu VND chặn một con số gõ thừa vài số 0 hiện thẳng lên bài — khớp
 * `MaxShippingFee` ở core-lib.
 */
export class PostShippingFee1803500000000 implements MigrationInterface {
  name = 'PostShippingFee1803500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "posts"
        ADD COLUMN "shipping_fee" integer,
        ADD CONSTRAINT "CHK_posts_shipping_fee_range"
          CHECK ("shipping_fee" IS NULL OR "shipping_fee" BETWEEN 0 AND 10000000),
        ADD CONSTRAINT "CHK_posts_shipping_fee_delivery"
          CHECK ("shipping_fee" IS NULL OR "delivery_method" = 'GIVER_SHIPS')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "posts"
        DROP CONSTRAINT IF EXISTS "CHK_posts_shipping_fee_delivery",
        DROP CONSTRAINT IF EXISTS "CHK_posts_shipping_fee_range",
        DROP COLUMN IF EXISTS "shipping_fee"
    `);
  }
}
