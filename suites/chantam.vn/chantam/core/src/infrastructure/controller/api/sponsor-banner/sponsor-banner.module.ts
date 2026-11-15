import { Module } from '@nestjs/common';
import { CampaignPromotionController } from './campaign-promotion.controller';
import { SponsorBannerPublicController } from './sponsor-banner-public.controller';
import { AdminSponsorBannerController } from './sponsor-banner.controller';

@Module({
  controllers: [
    AdminSponsorBannerController,
    SponsorBannerPublicController,
    CampaignPromotionController,
  ],
})
export class SponsorBannerControllerModule {}
