import {
  BannerApprovalStatus,
  BannerDisplayType,
  BannerPlacement,
  CampaignPromotionServingState,
} from '@chantam.vn/chantam.core-lib/models';
import { IUseCase } from '@chantam/service.common-lib';

/**
 * Đề xuất chiến dịch lên trang chủ — đường của CHỦ chiến dịch (15/11).
 *
 * Đề xuất là một hàng `sponsor_banners` nguồn `CAMPAIGN`. Owner chỉ gửi nội dung; link về
 * chiến dịch và tên đối tác do server điền, duyệt và bật/tắt là việc của Admin.
 */
export interface ICampaignPromotionInput {
  readonly title: string;
  /** Key từ `POST /charity-campaigns/media/upload` — phải là ảnh của chính người gửi. */
  readonly imageKey: string;
  readonly placement: string;
  readonly displayType: string;
  readonly displayOrder?: number;
  readonly startsAt: string;
  readonly endsAt: string;
}

export interface ICampaignPromotionBodyDto {
  readonly promotion: ICampaignPromotionInput;
}

export interface IUpdateCampaignPromotionBodyDto {
  readonly promotion: Partial<ICampaignPromotionInput>;
}

/** Bộ trường owner thấy — KHÔNG có số liệu hiển thị/bấm (số của Admin và đối soát). */
export interface ICampaignPromotionDto {
  readonly globalId: string;
  readonly title: string;
  readonly imageUrl: string;
  readonly targetUrl: string;
  readonly placement: BannerPlacement;
  readonly displayType: BannerDisplayType;
  readonly displayOrder: number;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly approvalStatus: BannerApprovalStatus;
  /** Lý do từ chối khi `approvalStatus = REJECTED`. */
  readonly approvalNote: string | null;
  readonly isActive: boolean;
  readonly servingState: CampaignPromotionServingState;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ICreateCampaignPromotionCommand extends ICampaignPromotionBodyDto {
  readonly actorUserId: string;
  readonly campaignId: string;
}

export interface IUpdateCampaignPromotionCommand extends IUpdateCampaignPromotionBodyDto {
  readonly actorUserId: string;
  readonly campaignId: string;
  readonly promotionId: string;
}

export interface IListCampaignPromotionsCommand {
  readonly actorUserId: string;
  readonly campaignId: string;
}

export interface ICampaignPromotionResult {
  readonly promotion: ICampaignPromotionDto;
}

export interface IListCampaignPromotionsResult {
  readonly promotions: ICampaignPromotionDto[];
}

export interface ICreateCampaignPromotionUseCase extends IUseCase<
  ICreateCampaignPromotionCommand,
  ICampaignPromotionResult
> {}
export const ICreateCampaignPromotionUseCase = Symbol(
  'ICreateCampaignPromotionUseCase',
);

export interface IUpdateCampaignPromotionUseCase extends IUseCase<
  IUpdateCampaignPromotionCommand,
  ICampaignPromotionResult
> {}
export const IUpdateCampaignPromotionUseCase = Symbol(
  'IUpdateCampaignPromotionUseCase',
);

export interface IListCampaignPromotionsUseCase extends IUseCase<
  IListCampaignPromotionsCommand,
  IListCampaignPromotionsResult
> {}
export const IListCampaignPromotionsUseCase = Symbol(
  'IListCampaignPromotionsUseCase',
);
