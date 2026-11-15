import {
  ICampaignPromotionDto,
  ICampaignPromotionInput,
  ICampaignPromotionResult,
  ICreateCampaignPromotionCommand,
  ICreateCampaignPromotionUseCase,
  IListCampaignPromotionsCommand,
  IListCampaignPromotionsResult,
  IListCampaignPromotionsUseCase,
  IUpdateCampaignPromotionCommand,
  IUpdateCampaignPromotionUseCase,
} from '@/application/contracts/sponsor-banner';
import {
  CampaignPromotionLimitReachedException,
  CampaignPromotionNotEligibleException,
  CampaignPromotionNotFoundException,
  CharityCampaignNotFoundException,
} from '@/domain/exceptions';
import {
  IAdminConfigRepository,
  ICampaignPromotionChanges,
  ICharityCampaign,
  ICharityCampaignRepository,
  ISponsorBanner,
  ISponsorBannerRepository,
} from '@/domain/ports/repository';
import {
  BannerDisplayType,
  BannerPlacement,
  BannerPlacements,
  CampaignPromotionMaxOpenConfigKey,
  MaxBannerPartnerNameLength,
  MaxBannerTitleLength,
  bannerDisplayTypeGaps,
  campaignPromotionServingState,
  campaignPromotionTargetUrl,
  isBannerImageUrl,
  normalizeCampaignPromotionMaxOpen,
} from '@chantam.vn/chantam.core-lib/models';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import { IObjectStorage } from '@chantam/service.storage-lib';
import { Inject, Injectable } from '@nestjs/common';
import { withStorageValidation } from '../shared/storage-error';

/**
 * Đề xuất chiến dịch lên trang chủ — đường của CHỦ chiến dịch (15/11).
 *
 * Ba thứ owner KHÔNG quyết: link (server dựng về đúng chiến dịch), tên đối tác (ảnh chụp tên
 * chiến dịch), và trạng thái (mọi lượt ghi của owner đều vào `PENDING_APPROVAL`). Nhờ vậy một
 * tài khoản bị chiếm cũng không đưa được gì lên app nếu Admin chưa nhìn qua.
 */

function toDto(banner: ISponsorBanner, now: Date): ICampaignPromotionDto {
  return {
    globalId: banner.globalId,
    title: banner.title,
    imageUrl: banner.imageUrl,
    targetUrl: banner.targetUrl,
    placement: banner.placement,
    displayType: banner.displayType,
    displayOrder: banner.displayOrder,
    startsAt: banner.startsAt,
    endsAt: banner.endsAt,
    approvalStatus: banner.approvalStatus,
    approvalNote: banner.approvalNote,
    isActive: banner.isActive,
    servingState: campaignPromotionServingState({ ...banner, now }),
    createdAt: banner.createdAt,
    updatedAt: banner.updatedAt,
  };
}

/** Chiến dịch phải tồn tại (chưa xoá) và thuộc người gọi. */
async function loadOwnedCampaign(
  campaigns: ICharityCampaignRepository,
  campaignId: string,
  actorUserId: string,
): Promise<ICharityCampaign> {
  const campaign = await campaigns.findByGlobalId(campaignId);
  if (!campaign) throw new CharityCampaignNotFoundException();
  if (campaign.createdBy !== actorUserId) throw new ForbiddenException();
  return campaign;
}

/** Cùng luật với `CampaignEligible` ở repository — kiểm sớm để trả lỗi trước khi đụng storage. */
function assertEligible(campaign: ICharityCampaign): void {
  if (campaign.approvalStatus !== 'APPROVED' || !campaign.isActive)
    throw new CampaignPromotionNotEligibleException();
}

async function readMaxOpen(config: IAdminConfigRepository): Promise<number> {
  return normalizeCampaignPromotionMaxOpen(
    await config.getConfigValue(CampaignPromotionMaxOpenConfigKey),
  );
}

function parseInstant(value: string, field: string, gaps: string[]): Date {
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime()))
    gaps.push(`${field} không phải thời điểm hợp lệ`);
  return instant;
}

/**
 * Kiểm phần nội dung đề xuất. `current` có khi là lượt sửa: cặp vị trí–kiểu và khung giờ
 * được kiểm trên giá trị SAU khi trộn với bản đang lưu.
 */
function prepareChanges(
  input: Partial<ICampaignPromotionInput>,
  current: ISponsorBanner | null,
): Omit<ICampaignPromotionChanges, 'imageUrl'> {
  const gaps: string[] = [];
  const changes: Record<string, unknown> = {};

  if (input.title !== undefined) {
    const title = input.title.trim();
    if (title.length === 0) gaps.push('title không được rỗng');
    if (title.length > MaxBannerTitleLength)
      gaps.push(`title không vượt ${MaxBannerTitleLength} ký tự`);
    changes.title = title;
  }
  if (input.placement !== undefined) {
    if (!BannerPlacements.includes(input.placement as BannerPlacement))
      gaps.push(`placement phải là một trong: ${BannerPlacements.join(', ')}`);
    changes.placement = input.placement;
  }
  if (input.displayType !== undefined) changes.displayType = input.displayType;
  if (input.displayOrder !== undefined) {
    if (!Number.isInteger(input.displayOrder) || input.displayOrder < 0)
      gaps.push('displayOrder phải là số nguyên không âm');
    changes.displayOrder = input.displayOrder;
  }
  const startsAt =
    input.startsAt === undefined
      ? undefined
      : parseInstant(input.startsAt, 'startsAt', gaps);
  const endsAt =
    input.endsAt === undefined
      ? undefined
      : parseInstant(input.endsAt, 'endsAt', gaps);
  if (startsAt !== undefined) changes.startsAt = startsAt;
  if (endsAt !== undefined) changes.endsAt = endsAt;

  if (gaps.length > 0) throw new ValidationFailedException(gaps);

  const placement = (changes.placement ??
    current?.placement) as BannerPlacement;
  const displayType = (changes.displayType ?? current?.displayType) as string;
  const pairGaps = bannerDisplayTypeGaps(placement, displayType);
  if (pairGaps.length > 0) throw new ValidationFailedException(pairGaps);

  const finalStarts =
    (changes.startsAt as Date | undefined) ?? current?.startsAt;
  const finalEnds = (changes.endsAt as Date | undefined) ?? current?.endsAt;
  if (finalStarts && finalEnds && finalEnds.getTime() <= finalStarts.getTime())
    throw new ValidationFailedException(['endsAt phải sau startsAt']);

  return changes as Omit<ICampaignPromotionChanges, 'imageUrl'>;
}

/**
 * Xác minh ảnh owner vừa tải lên rồi lấy URL công khai — owner không dán URL tuỳ ý.
 *
 * Object phải nằm dưới vùng của CHÍNH người gửi (`confirmCampaignMediaUpload` kiểm), phải là
 * ảnh, và URL phải là `https` vì `CHK_sponsor_banners_image_url` chặn mọi thứ khác — kiểm
 * ở đây để trả 400 nói đúng chuyện thay vì 500 từ Postgres (storage dev chạy `http`).
 */
async function confirmImage(
  storage: IObjectStorage,
  userId: string,
  key: string,
): Promise<string> {
  const confirmed = await withStorageValidation('imageKey', () =>
    storage.confirmCampaignMediaUpload(userId, key),
  );
  if (confirmed.mediaType !== 'IMAGE')
    throw new ValidationFailedException(['imageKey phải là một ảnh']);
  if (!isBannerImageUrl(confirmed.publicUrl))
    throw new ValidationFailedException([
      'imageKey: kho ảnh chưa cấp được đường dẫn https cho ảnh này — banner chỉ nhận ảnh https',
    ]);
  return confirmed.publicUrl;
}

@Injectable()
export class CreateCampaignPromotionUseCase implements ICreateCampaignPromotionUseCase {
  public constructor(
    @Inject(ISponsorBannerRepository)
    private readonly banners: ISponsorBannerRepository,
    @Inject(ICharityCampaignRepository)
    private readonly campaigns: ICharityCampaignRepository,
    @Inject(IObjectStorage) private readonly storage: IObjectStorage,
    @Inject(IAdminConfigRepository)
    private readonly config: IAdminConfigRepository,
  ) {}

  public async handle(
    command: ICreateCampaignPromotionCommand,
  ): Promise<ICampaignPromotionResult> {
    const campaign = await loadOwnedCampaign(
      this.campaigns,
      command.campaignId,
      command.actorUserId,
    );
    assertEligible(campaign);

    const input = command.promotion;
    const changes = prepareChanges(input, null);
    const imageUrl = await confirmImage(
      this.storage,
      command.actorUserId,
      input.imageKey,
    );
    const maxOpen = await readMaxOpen(this.config);

    const outcome = await this.banners.createCampaignPromotion({
      campaignId: campaign.globalId,
      requestedBy: command.actorUserId,
      partnerName: campaign.title.slice(0, MaxBannerPartnerNameLength),
      title: changes.title as string,
      imageUrl,
      targetUrl: campaignPromotionTargetUrl(campaign.globalId),
      placement: changes.placement as BannerPlacement,
      displayType: changes.displayType as BannerDisplayType,
      displayOrder: changes.displayOrder ?? 1,
      startsAt: changes.startsAt as Date,
      endsAt: changes.endsAt as Date,
      maxOpen,
    });

    switch (outcome.kind) {
      case 'CREATED':
        return { promotion: toDto(outcome.banner, new Date()) };
      // Chiến dịch vừa bị đóng/đình chỉ giữa lượt kiểm sớm và lượt khoá hàng.
      case 'NOT_ELIGIBLE':
        throw new CampaignPromotionNotEligibleException();
      case 'LIMIT_REACHED':
        throw new CampaignPromotionLimitReachedException(maxOpen);
    }
  }
}

@Injectable()
export class UpdateCampaignPromotionUseCase implements IUpdateCampaignPromotionUseCase {
  public constructor(
    @Inject(ISponsorBannerRepository)
    private readonly banners: ISponsorBannerRepository,
    @Inject(ICharityCampaignRepository)
    private readonly campaigns: ICharityCampaignRepository,
    @Inject(IObjectStorage) private readonly storage: IObjectStorage,
    @Inject(IAdminConfigRepository)
    private readonly config: IAdminConfigRepository,
  ) {}

  public async handle(
    command: IUpdateCampaignPromotionCommand,
  ): Promise<ICampaignPromotionResult> {
    const campaign = await loadOwnedCampaign(
      this.campaigns,
      command.campaignId,
      command.actorUserId,
    );

    const input = command.promotion;
    if (Object.values(input).every((value) => value === undefined))
      throw new ValidationFailedException([
        'promotion: phải gửi ít nhất một trường cần sửa',
      ]);

    assertEligible(campaign);

    const current = await this.banners.findCampaignPromotion(
      campaign.globalId,
      command.promotionId,
    );
    if (!current) throw new CampaignPromotionNotFoundException();

    const changes: ICampaignPromotionChanges = {
      ...prepareChanges(input, current),
      ...(input.imageKey === undefined
        ? {}
        : {
            imageUrl: await confirmImage(
              this.storage,
              command.actorUserId,
              input.imageKey,
            ),
          }),
    };

    const maxOpen = await readMaxOpen(this.config);
    const outcome = await this.banners.updateCampaignPromotion({
      campaignId: campaign.globalId,
      promotionId: command.promotionId,
      changes,
      maxOpen,
    });

    switch (outcome.kind) {
      case 'UPDATED':
        return { promotion: toDto(outcome.banner, new Date()) };
      case 'NOT_FOUND':
        throw new CampaignPromotionNotFoundException();
      case 'NOT_ELIGIBLE':
        throw new CampaignPromotionNotEligibleException();
      case 'LIMIT_REACHED':
        throw new CampaignPromotionLimitReachedException(maxOpen);
    }
  }
}

@Injectable()
export class ListCampaignPromotionsUseCase implements IListCampaignPromotionsUseCase {
  public constructor(
    @Inject(ISponsorBannerRepository)
    private readonly banners: ISponsorBannerRepository,
    @Inject(ICharityCampaignRepository)
    private readonly campaigns: ICharityCampaignRepository,
  ) {}

  public async handle(
    command: IListCampaignPromotionsCommand,
  ): Promise<IListCampaignPromotionsResult> {
    const campaign = await loadOwnedCampaign(
      this.campaigns,
      command.campaignId,
      command.actorUserId,
    );
    const now = new Date();
    const rows = await this.banners.listByCampaign(campaign.globalId);
    return { promotions: rows.map((row) => toDto(row, now)) };
  }
}
