import {
  ICreateCampaignPromotionUseCase,
  ICreateSponsorBannerUseCase,
  IDecideSponsorBannerApprovalUseCase,
  IDeleteSponsorBannerUseCase,
  IListAdminSponsorBannersUseCase,
  IListCampaignPromotionsUseCase,
  IRecordBannerClickUseCase,
  IServeSponsorBannersUseCase,
  ISetSponsorBannerActiveUseCase,
  IUpdateCampaignPromotionUseCase,
  IUpdateSponsorBannerUseCase,
} from '@/application/contracts/sponsor-banner';
import { Global, Module } from '@nestjs/common';
import {
  CreateCampaignPromotionUseCase,
  ListCampaignPromotionsUseCase,
  UpdateCampaignPromotionUseCase,
} from './campaign-promotion.use-cases';
import {
  CreateSponsorBannerUseCase,
  DecideSponsorBannerApprovalUseCase,
  DeleteSponsorBannerUseCase,
  ListAdminSponsorBannersUseCase,
  RecordBannerClickUseCase,
  ServeSponsorBannersUseCase,
  SetSponsorBannerActiveUseCase,
  UpdateSponsorBannerUseCase,
} from './sponsor-banner.use-cases';

/**
 * `@Global()` như mọi feature module khác của tầng application.
 *
 * `ApplicationModule` KHÔNG `@Global()`, nên controller chỉ thấy use case khi module khai nó
 * là global. Thiếu dòng này thì Nest ném `can't resolve dependencies` ngay lúc boot, và
 * KHÔNG một unit test nào bắt được — mọi spec dựng use case bằng `new`.
 */
@Global()
@Module({
  providers: [
    {
      provide: ICreateSponsorBannerUseCase,
      useClass: CreateSponsorBannerUseCase,
    },
    {
      provide: IUpdateSponsorBannerUseCase,
      useClass: UpdateSponsorBannerUseCase,
    },
    {
      provide: IListAdminSponsorBannersUseCase,
      useClass: ListAdminSponsorBannersUseCase,
    },
    {
      provide: IDecideSponsorBannerApprovalUseCase,
      useClass: DecideSponsorBannerApprovalUseCase,
    },
    {
      provide: ISetSponsorBannerActiveUseCase,
      useClass: SetSponsorBannerActiveUseCase,
    },
    {
      provide: IDeleteSponsorBannerUseCase,
      useClass: DeleteSponsorBannerUseCase,
    },
    {
      provide: IServeSponsorBannersUseCase,
      useClass: ServeSponsorBannersUseCase,
    },
    { provide: IRecordBannerClickUseCase, useClass: RecordBannerClickUseCase },
    // Đề xuất chiến dịch lên trang chủ (15/11) — cùng resource `sponsor_banners`.
    {
      provide: ICreateCampaignPromotionUseCase,
      useClass: CreateCampaignPromotionUseCase,
    },
    {
      provide: IListCampaignPromotionsUseCase,
      useClass: ListCampaignPromotionsUseCase,
    },
    {
      provide: IUpdateCampaignPromotionUseCase,
      useClass: UpdateCampaignPromotionUseCase,
    },
  ],
  exports: [
    ICreateSponsorBannerUseCase,
    IUpdateSponsorBannerUseCase,
    IListAdminSponsorBannersUseCase,
    IDecideSponsorBannerApprovalUseCase,
    ISetSponsorBannerActiveUseCase,
    IDeleteSponsorBannerUseCase,
    IServeSponsorBannersUseCase,
    IRecordBannerClickUseCase,
    ICreateCampaignPromotionUseCase,
    IListCampaignPromotionsUseCase,
    IUpdateCampaignPromotionUseCase,
  ],
})
export class SponsorBannerUseCaseModule {}
