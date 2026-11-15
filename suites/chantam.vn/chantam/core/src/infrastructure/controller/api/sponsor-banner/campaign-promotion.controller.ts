import {
  ICreateCampaignPromotionUseCase,
  IListCampaignPromotionsUseCase,
  IUpdateCampaignPromotionUseCase,
} from '@/application/contracts/sponsor-banner';
import {
  CampaignPromotionLimitReachedException,
  CampaignPromotionNotEligibleException,
  CampaignPromotionNotFoundException,
  CharityCampaignNotFoundException,
} from '@/domain/exceptions';
import {
  ApiTokenErrors,
  CurrentUser,
  IAuthPrincipal,
} from '@chantam/service.auth-lib';
import { ApiErrorResponses } from '@chantam/service.common-lib/decorators';
import { ResponseDto } from '@chantam/service.common-lib/dto';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  CampaignPromotionItemParamsDto,
  CampaignPromotionParamsDto,
  CampaignPromotionResponseDto,
  CreateCampaignPromotionBodyDto,
  ListCampaignPromotionsResponseDto,
  UpdateCampaignPromotionBodyDto,
} from '../../dto/sponsor-banner/campaign-promotion.dto';

/**
 * Đề xuất chiến dịch lên trang chủ — đường của CHỦ hoạt động từ thiện (15/11).
 *
 * File riêng dưới prefix `charity-campaigns` (cùng nhà với mọi thao tác owner), tách khỏi
 * controller Admin và công khai — `route-order-guard` quét theo FILE.
 *
 * Đề xuất là một hàng `sponsor_banners` nguồn `CAMPAIGN` và đi vào ĐÚNG màn Banner tài trợ
 * của Admin; không có màn duyệt thứ hai.
 */
@ApiTags('Hoạt động Từ thiện - Đề xuất lên trang chủ')
@ApiBearerAuth()
@Controller('charity-campaigns')
export class CampaignPromotionController {
  public constructor(
    @Inject(ICreateCampaignPromotionUseCase)
    private readonly createUseCase: ICreateCampaignPromotionUseCase,
    @Inject(IListCampaignPromotionsUseCase)
    private readonly listUseCase: IListCampaignPromotionsUseCase,
    @Inject(IUpdateCampaignPromotionUseCase)
    private readonly updateUseCase: IUpdateCampaignPromotionUseCase,
  ) {}

  @Post(':id/promotions')
  @ApiOperation({
    summary: 'Đề xuất quảng bá hoạt động lên trang chủ',
    description:
      'Chỉ chủ hoạt động, và hoạt động phải **đã duyệt, đang mở**. Đề xuất vào ' +
      '`PENDING_APPROVAL` và hiện trong màn Banner tài trợ của Admin; duyệt xong là chạy.\n\n' +
      'Ảnh: gửi `imageKey` từ `POST /charity-campaigns/media/upload`. Link mở về hoạt động ' +
      '(`chantam://campaign/<id>`) và tên đối tác (tên hoạt động) do server điền.\n\n' +
      'Mỗi hoạt động có tối đa N đề xuất **đang mở** (chờ duyệt hoặc đã duyệt còn hạn), N do ' +
      'Admin đặt ở `banner.campaign_promotion.max_open_per_campaign` (mặc định 3).',
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ForbiddenException,
    CharityCampaignNotFoundException,
    CampaignPromotionNotEligibleException,
    CampaignPromotionLimitReachedException,
    [
      ValidationFailedException,
      ['vị trí APP_SPLASH chỉ nhận displayType FULLSCREEN'],
    ],
  )
  @ApiCreatedResponse({
    type: ResponseDto.forApi(CampaignPromotionResponseDto),
  })
  public async createCampaignPromotion(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CampaignPromotionParamsDto,
    @Body() body: CreateCampaignPromotionBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.createUseCase.handle({
          actorUserId: principal.userId,
          campaignId: params.id,
          promotion: body.promotion,
        }),
      )
      .build();
  }

  @Get(':id/promotions')
  @ApiOperation({
    summary: 'Đề xuất lên trang chủ của hoạt động',
    description:
      'Chỉ chủ hoạt động. Mới nhất trước, kèm `servingState` và `approvalNote` (lý do từ ' +
      'chối). Không trả số lượt hiển thị/bấm — đó là số liệu đối soát của Admin.',
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ForbiddenException,
    CharityCampaignNotFoundException,
  )
  @ApiOkResponse({
    type: ResponseDto.forApi(ListCampaignPromotionsResponseDto),
  })
  public async listCampaignPromotions(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CampaignPromotionParamsDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.listUseCase.handle({
          actorUserId: principal.userId,
          campaignId: params.id,
        }),
      )
      .build();
  }

  @Patch(':id/promotions/:promotionId')
  @ApiOperation({
    summary: 'Sửa đề xuất lên trang chủ',
    description:
      'Chỉ chủ hoạt động; chỉ gửi trường muốn đổi. **Mọi lượt sửa đưa đề xuất về ' +
      '`PENDING_APPROVAL`** — bản đang chạy rời app tới khi Admin duyệt lại. Sửa một đề xuất ' +
      'bị từ chối chính là gửi lại (khi đó phải còn suất trong mốc).',
  })
  @ApiErrorResponses(
    ...ApiTokenErrors,
    ForbiddenException,
    CharityCampaignNotFoundException,
    CampaignPromotionNotFoundException,
    CampaignPromotionNotEligibleException,
    CampaignPromotionLimitReachedException,
    [
      ValidationFailedException,
      ['promotion: phải gửi ít nhất một trường cần sửa'],
    ],
  )
  @ApiOkResponse({ type: ResponseDto.forApi(CampaignPromotionResponseDto) })
  public async updateCampaignPromotion(
    @CurrentUser() principal: IAuthPrincipal,
    @Param() params: CampaignPromotionItemParamsDto,
    @Body() body: UpdateCampaignPromotionBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.updateUseCase.handle({
          actorUserId: principal.userId,
          campaignId: params.id,
          promotionId: params.promotionId,
          promotion: body.promotion,
        }),
      )
      .build();
  }
}
