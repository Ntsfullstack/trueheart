import {
  ICampaignPromotionChanges,
  ICreateCampaignPromotionOutcome,
  ICreateCampaignPromotionParams,
  ICreateSponsorBannerParams,
  IDecideSponsorBannerOutcome,
  ISponsorBanner,
  ISponsorBannerAdminItem,
  ISponsorBannerAdminPage,
  ISponsorBannerRepository,
  IUpdateCampaignPromotionOutcome,
  IWriteSponsorBannerParams,
} from '@/domain/ports/repository';
import {
  BannerApprovalStatus,
  BannerDisplayType,
  BannerPlacement,
  BannerSourceType,
  bannerClickThroughRate,
} from '@chantam.vn/chantam.core-lib/models';
import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { updateReturning } from './update-returning';

interface IRow {
  global_id: string;
  source_type: string;
  source_id: string | null;
  requested_by: string | null;
  display_type: string;
  partner_name: string;
  partner_contact: string | null;
  title: string;
  image_url: string;
  target_url: string;
  placement: string;
  display_order: string | number;
  starts_at: Date;
  ends_at: Date;
  is_active: boolean;
  approval_status: string;
  approval_note: string | null;
  approved_at: Date | null;
  approved_by: string | null;
  impression_count: string | number;
  click_count: string | number;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

interface IAdminRow extends IRow {
  source_campaign_title: string | null;
  source_campaign_slug: string | null;
  requester_full_name: string | null;
}

const ColumnNames = [
  'global_id',
  'source_type',
  'source_id',
  'requested_by',
  'display_type',
  'partner_name',
  'partner_contact',
  'title',
  'image_url',
  'target_url',
  'placement',
  'display_order',
  'starts_at',
  'ends_at',
  'is_active',
  'approval_status',
  'approval_note',
  'approved_at',
  'approved_by',
  'impression_count',
  'click_count',
  'created_by',
  'created_at',
  'updated_at',
] as const;

const Columns = ColumnNames.join(', ');

/**
 * Cùng danh sách, có tiền tố bảng — cho câu JOIN với `campaigns`/`users`, hai bảng cũng có
 * `global_id`, `title`, `created_at`… và một tên cột trần sẽ mơ hồ.
 */
const BannerColumns = ColumnNames.map((name) => `banner.${name}`).join(', ');

/**
 * Chiến dịch nguồn vẫn được quảng bá: đã duyệt, còn mở, chưa xoá (chốt 15/11, phương án B).
 * Dùng cho CẢ lúc owner ghi lẫn lúc phục vụ, để hai nơi không thể lệch nhau.
 */
const CampaignEligible = `approval_status = 'APPROVED' AND is_active AND deleted_at IS NULL`;

/**
 * Banner đang được phục vụ: đã duyệt, còn bật, chưa xoá, đang trong khung giờ — và nếu từ
 * chiến dịch thì chiến dịch nguồn vẫn đủ điều kiện.
 *
 * `EXISTS` theo khoá duy nhất `campaigns.global_id` và chỉ chạy cho hàng `CAMPAIGN`, nên banner
 * đối tác giữ nguyên đường đọc. Tham chiếu `sponsor_banners.source_id` có tên bảng đầy đủ để
 * dùng được cả trong `SELECT ... FROM sponsor_banners` lẫn `UPDATE sponsor_banners`.
 */
const ServingFilter = `approval_status = 'APPROVED'
      AND is_active
      AND deleted_at IS NULL
      AND starts_at <= now()
      AND ends_at > now()
      AND (source_type <> 'CAMPAIGN' OR EXISTS (
            SELECT 1 FROM campaigns campaign
             WHERE campaign.global_id = sponsor_banners.source_id
               AND campaign.approval_status = 'APPROVED'
               AND campaign.is_active
               AND campaign.deleted_at IS NULL))`;

/**
 * Đề xuất "đang mở" của MỘT chiến dịch (tham số `$1`) — thứ bị giới hạn bởi mốc. Bị từ
 * chối hoặc đã hết hạn thì không còn chiếm suất.
 */
const OpenPromotionOfCampaign = `source_type = 'CAMPAIGN'
      AND source_id = $1
      AND deleted_at IS NULL
      AND (approval_status = 'PENDING_APPROVAL'
           OR (approval_status = 'APPROVED' AND ends_at > now()))`;

function toBanner(row: IRow): ISponsorBanner {
  // `bigint` của Postgres về đây là CHUỖI. Trả thẳng ra API thì client nhận `"120"`, và
  // `clickCount / impressionCount` ở tầng nào đó thành phép chia chuỗi.
  const impressionCount = Number(row.impression_count);
  const clickCount = Number(row.click_count);

  return {
    globalId: row.global_id,
    sourceType: row.source_type as BannerSourceType,
    sourceId: row.source_id,
    requestedBy: row.requested_by,
    displayType: row.display_type as BannerDisplayType,
    partnerName: row.partner_name,
    partnerContact: row.partner_contact,
    title: row.title,
    imageUrl: row.image_url,
    targetUrl: row.target_url,
    placement: row.placement as BannerPlacement,
    displayOrder: Number(row.display_order),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    isActive: row.is_active,
    approvalStatus: row.approval_status as BannerApprovalStatus,
    approvalNote: row.approval_note,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by,
    impressionCount,
    clickCount,
    clickThroughRate: bannerClickThroughRate({ impressionCount, clickCount }),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toAdminItem(row: IAdminRow): ISponsorBannerAdminItem {
  return {
    ...toBanner(row),
    source:
      row.source_id && row.source_campaign_title !== null
        ? {
            campaignId: row.source_id,
            title: row.source_campaign_title,
            slug: row.source_campaign_slug ?? '',
          }
        : null,
    requester: row.requested_by
      ? { userId: row.requested_by, fullName: row.requester_full_name }
      : null,
  };
}

/** Khoá DTO -> cột, dùng cho câu `UPDATE` dựng động. */
const UpdatableColumns: Readonly<
  Record<keyof IWriteSponsorBannerParams, string>
> = {
  partnerName: 'partner_name',
  partnerContact: 'partner_contact',
  title: 'title',
  imageUrl: 'image_url',
  targetUrl: 'target_url',
  placement: 'placement',
  displayType: 'display_type',
  displayOrder: 'display_order',
  startsAt: 'starts_at',
  endsAt: 'ends_at',
};

/**
 * Dựng danh sách `SET` từ những trường được gửi.
 *
 * `firstIndex` là số thứ tự tham số đầu tiên còn trống — các câu gọi dùng `$1`, `$2` cho khoá.
 */
function assignmentsOf(
  changes: Partial<IWriteSponsorBannerParams>,
  firstIndex: number,
): { assignments: string[]; values: unknown[] } {
  const assignments: string[] = [];
  const values: unknown[] = [];
  for (const [key, column] of Object.entries(UpdatableColumns)) {
    const value = changes[key as keyof IWriteSponsorBannerParams];
    if (value === undefined) continue;
    values.push(value);
    assignments.push(`${column} = $${firstIndex + values.length - 1}`);
  }
  return { assignments, values };
}

@Injectable()
export class SponsorBannerRepository implements ISponsorBannerRepository {
  public constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
  ) {}

  public async create(
    params: ICreateSponsorBannerParams,
  ): Promise<ISponsorBanner> {
    // `INSERT … RETURNING` KHÔNG bị TypeORM bọc thành `[rows, affected]`.
    const [row] = await this.manager.query<IRow[]>(
      `INSERT INTO sponsor_banners
         (partner_name, partner_contact, title, image_url, target_url, placement,
          display_order, starts_at, ends_at, created_by, approval_status, approved_by,
          approved_at, source_type, display_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
               CASE WHEN $13 = 'PENDING_APPROVAL' THEN NULL ELSE now() END, $14, $15)
       RETURNING ${Columns}`,
      [
        params.partnerName,
        params.partnerContact,
        params.title,
        params.imageUrl,
        params.targetUrl,
        params.placement,
        params.displayOrder,
        params.startsAt,
        params.endsAt,
        params.createdBy,
        params.approvalStatus,
        params.approvedBy,
        // Truyền `approvalStatus` LẦN HAI làm `$13`. Dùng một tham số vừa ở vị trí VALUES
        // (cột `varchar(30)`) vừa trong phép so `= 'PENDING_APPROVAL'` (hằng `text`) làm
        // Postgres ném "inconsistent types deduced for parameter" — lỗi đã gặp ở F47.
        params.approvalStatus,
        params.sourceType,
        params.displayType,
      ],
    );
    return toBanner(row);
  }

  public async findByGlobalId(
    globalId: string,
  ): Promise<ISponsorBanner | null> {
    const [row] = await this.manager.query<IRow[]>(
      `SELECT ${Columns} FROM sponsor_banners
        WHERE global_id = $1 AND deleted_at IS NULL`,
      [globalId],
    );
    return row ? toBanner(row) : null;
  }

  public async findServing(params: {
    placement: BannerPlacement;
    limit: number;
  }): Promise<ISponsorBanner[]> {
    const rows = await this.manager.query<IRow[]>(
      `SELECT ${Columns} FROM sponsor_banners
        WHERE placement = $1 AND ${ServingFilter}
        ORDER BY display_order ASC, id ASC
        LIMIT $2`,
      [params.placement, params.limit],
    );
    return (rows ?? []).map(toBanner);
  }

  public async listForAdmin(query: {
    limit: number;
    offset: number;
    placement?: BannerPlacement;
    approvalStatus?: BannerApprovalStatus;
    sourceType?: BannerSourceType;
    sourceId?: string;
  }): Promise<ISponsorBannerAdminPage> {
    const filters: string[] = [];
    const filterValues: unknown[] = [];

    if (query.placement) {
      filterValues.push(query.placement);
      filters.push(`banner.placement = $${filterValues.length}`);
    }
    if (query.approvalStatus) {
      filterValues.push(query.approvalStatus);
      filters.push(`banner.approval_status = $${filterValues.length}`);
    }
    if (query.sourceType) {
      filterValues.push(query.sourceType);
      filters.push(`banner.source_type = $${filterValues.length}`);
    }
    if (query.sourceId) {
      filterValues.push(query.sourceId);
      filters.push(`banner.source_id = $${filterValues.length}`);
    }
    const where = ['banner.deleted_at IS NULL', ...filters].join(' AND ');

    // Câu đếm dùng ĐÚNG bộ lọc của câu đọc, và dùng chung mảng tham số — hai bản lọc lệch
    // nhau là Admin thấy "12 banner" rồi nhận về 8 hàng. Hai phép JOIN của câu đọc là LEFT
    // và theo khoá duy nhất, nên không đổi số hàng — câu đếm không cần chúng.
    const [counted] = await this.manager.query<{ total: string }[]>(
      `SELECT count(*)::text AS total FROM sponsor_banners banner WHERE ${where}`,
      filterValues,
    );
    const rows = await this.manager.query<IAdminRow[]>(
      `SELECT ${BannerColumns},
              campaign.title AS source_campaign_title,
              campaign.slug AS source_campaign_slug,
              requester.full_name AS requester_full_name
         FROM sponsor_banners banner
         LEFT JOIN campaigns campaign ON campaign.global_id = banner.source_id
         LEFT JOIN users requester ON requester.global_id = banner.requested_by
        WHERE ${where}
        ORDER BY banner.created_at DESC, banner.id DESC
        LIMIT $${filterValues.length + 1} OFFSET $${filterValues.length + 2}`,
      [...filterValues, query.limit, query.offset],
    );

    return {
      items: (rows ?? []).map(toAdminItem),
      total: Number(counted?.total ?? 0),
    };
  }

  /**
   * Sửa những trường người gọi có gửi, bỏ qua phần còn lại.
   *
   * Dựng danh sách `SET` từ `UpdatableColumns` thay vì viết tay từng nhánh `if`: thêm một
   * trường về sau chỉ phải khai một chỗ, và tên cột không thể bị gõ sai ở nhánh thứ chín.
   */
  public async update(params: {
    bannerId: string;
    changes: Partial<IWriteSponsorBannerParams>;
  }): Promise<ISponsorBanner | null> {
    const { assignments, values } = assignmentsOf(params.changes, 2);

    // Không có gì để sửa thì không chạy câu nào — một `UPDATE` rỗng vẫn đụng `updated_at`,
    // và Admin mất cách biết banner nào thật sự được sửa.
    if (assignments.length === 0) return this.findByGlobalId(params.bannerId);

    const rows = await updateReturning<IRow>(
      this.manager,
      `UPDATE sponsor_banners
          SET ${assignments.join(', ')}, updated_at = now()
        WHERE global_id = $1 AND deleted_at IS NULL
        RETURNING ${Columns}`,
      [params.bannerId, ...values],
    );
    return rows.length > 0 ? toBanner(rows[0]) : null;
  }

  public async decideApproval(params: {
    bannerId: string;
    approverId: string;
    approve: boolean;
    note: string | null;
    expectedUpdatedAt: Date | null;
  }): Promise<IDecideSponsorBannerOutcome> {
    // So `updated_at` ở độ phân giải MILI giây: Postgres giữ micro giây, còn mốc client gửi
    // lại đi qua `Date` của JS — so thẳng thì không bao giờ bằng.
    const rows = await updateReturning<IRow>(
      this.manager,
      `UPDATE sponsor_banners
          SET approval_status = CASE WHEN $3 THEN 'APPROVED' ELSE 'REJECTED' END,
              approval_note = $4,
              approved_by = $2,
              approved_at = now(),
              updated_at = now()
        WHERE global_id = $1
          AND approval_status = 'PENDING_APPROVAL'
          AND deleted_at IS NULL
          AND ($5::timestamptz IS NULL
               OR date_trunc('milliseconds', updated_at) = $5::timestamptz)
        RETURNING ${Columns}`,
      [
        params.bannerId,
        params.approverId,
        params.approve,
        params.note,
        params.expectedUpdatedAt,
      ],
    );
    if (rows.length > 0) return { kind: 'DECIDED', banner: toBanner(rows[0]) };

    // Không khớp hàng nào: đọc lại để nói đúng lý do. Hai lý do dẫn tới hai việc khác nhau
    // cho Admin — "người khác đã xử lý" thì thôi, "nội dung vừa đổi" thì phải xem lại.
    const [current] = await this.manager.query<{ approval_status: string }[]>(
      `SELECT approval_status FROM sponsor_banners
        WHERE global_id = $1 AND deleted_at IS NULL`,
      [params.bannerId],
    );
    if (!current) return { kind: 'NOT_FOUND' };
    if (current.approval_status !== 'PENDING_APPROVAL')
      return { kind: 'ALREADY_DECIDED' };
    return { kind: 'CHANGED' };
  }

  public async setActive(params: {
    bannerId: string;
    isActive: boolean;
  }): Promise<ISponsorBanner | null> {
    const rows = await updateReturning<IRow>(
      this.manager,
      `UPDATE sponsor_banners
          SET is_active = $2, updated_at = now()
        WHERE global_id = $1 AND deleted_at IS NULL
        RETURNING ${Columns}`,
      [params.bannerId, params.isActive],
    );
    return rows.length > 0 ? toBanner(rows[0]) : null;
  }

  public async softDelete(bannerId: string): Promise<boolean> {
    // Xoá MỀM: `impression_count` của một banner đã chạy là con số đối soát với đối tác, và
    // xoá cứng là huỷ bằng chứng của một hợp đồng đã thực hiện.
    const rows = await updateReturning<{ global_id: string }>(
      this.manager,
      `UPDATE sponsor_banners
          SET deleted_at = now(), is_active = false, updated_at = now()
        WHERE global_id = $1 AND deleted_at IS NULL
        RETURNING global_id`,
      [bannerId],
    );
    return rows.length > 0;
  }

  public async recordImpressions(bannerIds: readonly string[]): Promise<void> {
    if (bannerIds.length === 0) return;
    await updateReturning(
      this.manager,
      `UPDATE sponsor_banners
          SET impression_count = impression_count + 1
        WHERE global_id = ANY($1::uuid[])
        RETURNING global_id`,
      [bannerIds],
    );
  }

  public async recordClick(bannerId: string): Promise<boolean> {
    // Chỉ đếm lượt bấm của banner ĐANG được phục vụ. Thiếu `ServingFilter` ở đây thì một
    // link cũ nằm trong ảnh chụp màn hình vẫn cộng số cho một hợp đồng đã hết.
    const rows = await updateReturning<{ global_id: string }>(
      this.manager,
      `UPDATE sponsor_banners
          SET click_count = click_count + 1
        WHERE global_id = $1 AND ${ServingFilter}
        RETURNING global_id`,
      [bannerId],
    );
    return rows.length > 0;
  }

  public async createCampaignPromotion(
    params: ICreateCampaignPromotionParams,
  ): Promise<ICreateCampaignPromotionOutcome> {
    return this.manager.transaction(async (tx) => {
      if (!(await lockEligibleCampaign(tx, params.campaignId)))
        return { kind: 'NOT_ELIGIBLE' };

      if ((await countOpenPromotions(tx, params.campaignId)) >= params.maxOpen)
        return { kind: 'LIMIT_REACHED' };

      // `$2` dùng hai lần cho `requested_by` và `created_by` — cùng kiểu `uuid`, không gặp
      // lỗi suy kiểu 42P08.
      const [row] = await tx.query<IRow[]>(
        `INSERT INTO sponsor_banners
           (source_type, source_id, requested_by, created_by, partner_name, title,
            image_url, target_url, placement, display_type, display_order, starts_at,
            ends_at, approval_status)
         VALUES ('CAMPAIGN', $1, $2, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
                 'PENDING_APPROVAL')
         RETURNING ${Columns}`,
        [
          params.campaignId,
          params.requestedBy,
          params.partnerName,
          params.title,
          params.imageUrl,
          params.targetUrl,
          params.placement,
          params.displayType,
          params.displayOrder,
          params.startsAt,
          params.endsAt,
        ],
      );
      return { kind: 'CREATED', banner: toBanner(row) };
    });
  }

  public async listByCampaign(campaignId: string): Promise<ISponsorBanner[]> {
    const rows = await this.manager.query<IRow[]>(
      `SELECT ${Columns} FROM sponsor_banners
        WHERE source_type = 'CAMPAIGN' AND source_id = $1 AND deleted_at IS NULL
        ORDER BY created_at DESC, id DESC`,
      [campaignId],
    );
    return (rows ?? []).map(toBanner);
  }

  public async findCampaignPromotion(
    campaignId: string,
    promotionId: string,
  ): Promise<ISponsorBanner | null> {
    const [row] = await this.manager.query<IRow[]>(
      `SELECT ${Columns} FROM sponsor_banners
        WHERE global_id = $1 AND source_type = 'CAMPAIGN' AND source_id = $2
          AND deleted_at IS NULL`,
      [promotionId, campaignId],
    );
    return row ? toBanner(row) : null;
  }

  public async updateCampaignPromotion(params: {
    campaignId: string;
    promotionId: string;
    changes: ICampaignPromotionChanges;
    maxOpen: number;
  }): Promise<IUpdateCampaignPromotionOutcome> {
    return this.manager.transaction(async (tx) => {
      // Khoá chiến dịch TRƯỚC khoá hàng banner — cùng thứ tự với lượt tạo, để hai lượt
      // tạo/sửa song song không khoá chéo nhau.
      if (!(await lockEligibleCampaign(tx, params.campaignId)))
        return { kind: 'NOT_ELIGIBLE' };

      const [current] = await tx.query<{ is_open: boolean }[]>(
        `SELECT (approval_status = 'PENDING_APPROVAL'
                 OR (approval_status = 'APPROVED' AND ends_at > now())) AS is_open
           FROM sponsor_banners
          WHERE global_id = $1 AND source_type = 'CAMPAIGN' AND source_id = $2
            AND deleted_at IS NULL
          FOR UPDATE`,
        [params.promotionId, params.campaignId],
      );
      if (!current) return { kind: 'NOT_FOUND' };

      // Sửa xong luôn là `PENDING_APPROVAL`, tức luôn "đang mở". Hàng vốn đang mở thì đã
      // được tính; hàng bị từ chối/hết hạn thì đang giành lại một suất.
      if (
        !current.is_open &&
        (await countOpenPromotions(tx, params.campaignId)) >= params.maxOpen
      )
        return { kind: 'LIMIT_REACHED' };

      const { assignments, values } = assignmentsOf(params.changes, 3);
      const rows = await updateReturning<IRow>(
        tx,
        `UPDATE sponsor_banners
            SET ${[...assignments, ''].join(', ')}
                approval_status = 'PENDING_APPROVAL',
                approved_at = NULL,
                approved_by = NULL,
                approval_note = NULL,
                updated_at = now()
          WHERE global_id = $1 AND source_id = $2 AND deleted_at IS NULL
          RETURNING ${Columns}`,
        [params.promotionId, params.campaignId, ...values],
      );
      return rows.length > 0
        ? { kind: 'UPDATED', banner: toBanner(rows[0]) }
        : { kind: 'NOT_FOUND' };
    });
  }
}

/**
 * Khoá hàng chiến dịch và cho biết nó còn được quảng bá không. `false` cả khi không tồn tại —
 * use case đã kiểm tồn tại và quyền chủ trước khi tới đây.
 */
async function lockEligibleCampaign(
  tx: EntityManager,
  campaignId: string,
): Promise<boolean> {
  const [campaign] = await tx.query<{ eligible: boolean }[]>(
    `SELECT (${CampaignEligible}) AS eligible
       FROM campaigns WHERE global_id = $1
     FOR UPDATE`,
    [campaignId],
  );
  return campaign?.eligible === true;
}

async function countOpenPromotions(
  tx: EntityManager,
  campaignId: string,
): Promise<number> {
  const [counted] = await tx.query<{ open: string }[]>(
    `SELECT count(*)::text AS open FROM sponsor_banners
      WHERE ${OpenPromotionOfCampaign}`,
    [campaignId],
  );
  return Number(counted?.open ?? 0);
}
