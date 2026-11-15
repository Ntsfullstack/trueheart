import {
  ICampaignPromotionBodyDto,
  ICampaignPromotionDto,
  ICampaignPromotionInput,
  IUpdateCampaignPromotionBodyDto,
} from '@/application/contracts/sponsor-banner';
import {
  BannerApprovalStatuses,
  BannerDisplayTypes,
  BannerPlacements,
  CampaignPromotionServingState,
  MaxBannerTitleLength,
} from '@chantam.vn/chantam.core-lib/models';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import { NotNullWhenPresent } from '../not-null-when-present';

const PlacementDescription =
  'Vị trí hiển thị (allowlist). `APP_SPLASH` = poster toàn màn hình sau Splash.';
const DisplayTypeDescription =
  'Cách app dựng. `APP_SPLASH` CHỈ đi với `FULLSCREEN` và ngược lại; vị trí khác nhận ' +
  '`BANNER`, `SLIDER`, `INLINE`, `FLOATING`.';

export class CampaignPromotionInputDto implements ICampaignPromotionInput {
  @ApiProperty({
    example: 'Chung tay áo ấm vùng cao',
    maxLength: MaxBannerTitleLength,
    description: 'Nội dung quảng bá hiện trên banner.',
  })
  @IsString()
  @Length(1, MaxBannerTitleLength)
  title: string;

  @ApiProperty({
    example: 'users/9f1c.../campaign-media/promo.jpg',
    description:
      'Key từ `POST /charity-campaigns/media/upload` (PUT xong mới gửi). Phải là ẢNH của chính ' +
      'người gửi; server tự dựng URL — không nhận URL dán tay.',
  })
  @IsString()
  @Length(1, 500)
  imageKey: string;

  @ApiProperty({ enum: BannerPlacements, description: PlacementDescription })
  @IsIn(BannerPlacements as readonly string[])
  placement: string;

  @ApiProperty({
    enum: BannerDisplayTypes,
    description: DisplayTypeDescription,
  })
  @IsIn(BannerDisplayTypes as readonly string[])
  displayType: string;

  @ApiPropertyOptional({
    minimum: 0,
    default: 1,
    description:
      'Thứ tự mong muốn trong vị trí, nhỏ hiện trước. Admin chỉnh được.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @ApiProperty({ example: '2026-12-01T00:00:00.000Z' })
  @IsISO8601()
  startsAt: string;

  @ApiProperty({
    example: '2026-12-31T00:00:00.000Z',
    description: 'Phải sau `startsAt`. Được vượt ngày kết thúc của chiến dịch.',
  })
  @IsISO8601()
  endsAt: string;
}

export class CreateCampaignPromotionBodyDto implements ICampaignPromotionBodyDto {
  @ApiProperty({ type: () => CampaignPromotionInputDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => CampaignPromotionInputDto)
  promotion: CampaignPromotionInputDto;
}

/** Lượt sửa: mọi trường tuỳ chọn; trường bỏ trống là "không đổi". */
export class UpdateCampaignPromotionInputDto implements Partial<ICampaignPromotionInput> {
  @ApiPropertyOptional({ maxLength: MaxBannerTitleLength })
  @NotNullWhenPresent()
  @IsString()
  @Length(1, MaxBannerTitleLength)
  title?: string;

  @ApiPropertyOptional({
    description: 'Key ảnh mới — xác minh lại như lúc tạo.',
  })
  @NotNullWhenPresent()
  @IsString()
  @Length(1, 500)
  imageKey?: string;

  @ApiPropertyOptional({
    enum: BannerPlacements,
    description: PlacementDescription,
  })
  @NotNullWhenPresent()
  @IsIn(BannerPlacements as readonly string[])
  placement?: string;

  @ApiPropertyOptional({
    enum: BannerDisplayTypes,
    description: `${DisplayTypeDescription} Kiểm trên giá trị sau khi trộn với bản đang lưu.`,
  })
  @NotNullWhenPresent()
  @IsIn(BannerDisplayTypes as readonly string[])
  displayType?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @NotNullWhenPresent()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @ApiPropertyOptional()
  @NotNullWhenPresent()
  @IsISO8601()
  startsAt?: string;

  @ApiPropertyOptional()
  @NotNullWhenPresent()
  @IsISO8601()
  endsAt?: string;
}

export class UpdateCampaignPromotionBodyDto implements IUpdateCampaignPromotionBodyDto {
  @ApiProperty({ type: () => UpdateCampaignPromotionInputDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => UpdateCampaignPromotionInputDto)
  promotion: UpdateCampaignPromotionInputDto;
}

export class CampaignPromotionParamsDto {
  @ApiProperty({ format: 'uuid', description: 'Hoạt động từ thiện.' })
  @IsUUID()
  id: string;
}

export class CampaignPromotionItemParamsDto {
  @ApiProperty({ format: 'uuid', description: 'Hoạt động từ thiện.' })
  @IsUUID()
  id: string;

  @ApiProperty({ format: 'uuid', description: 'Đề xuất (globalId banner).' })
  @IsUUID()
  promotionId: string;
}

const ServingStates: readonly CampaignPromotionServingState[] = [
  'PENDING',
  'REJECTED',
  'INACTIVE',
  'SCHEDULED',
  'RUNNING',
  'EXPIRED',
];

export class CampaignPromotionResponseItemDto implements ICampaignPromotionDto {
  @ApiProperty({ format: 'uuid' }) globalId: string;
  @ApiProperty() title: string;
  @ApiProperty() imageUrl: string;

  @ApiProperty({
    example: 'chantam://campaign/0b6f...',
    description: 'Link mở về chiến dịch — server dựng, owner không sửa được.',
  })
  targetUrl: string;

  @ApiProperty({ enum: BannerPlacements })
  placement: (typeof BannerPlacements)[number];
  @ApiProperty({ enum: BannerDisplayTypes })
  displayType: (typeof BannerDisplayTypes)[number];
  @ApiProperty() displayOrder: number;
  @ApiProperty() startsAt: Date;
  @ApiProperty() endsAt: Date;

  @ApiProperty({ enum: BannerApprovalStatuses })
  approvalStatus: (typeof BannerApprovalStatuses)[number];

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Lý do từ chối khi `approvalStatus = REJECTED`.',
  })
  approvalNote: string | null;

  @ApiProperty({ description: 'Công tắc của Admin.' }) isActive: boolean;

  @ApiProperty({
    enum: ServingStates,
    description:
      'Trạng thái cho owner: `PENDING` chờ duyệt · `REJECTED` bị từ chối (xem `approvalNote`, ' +
      'sửa để gửi lại) · `INACTIVE` Admin đang tắt · `SCHEDULED` chưa tới giờ · `RUNNING` ' +
      'đang chạy · `EXPIRED` hết giờ. Không xét chiến dịch còn mở hay không.',
  })
  servingState: CampaignPromotionServingState;

  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class CampaignPromotionResponseDto {
  @ApiProperty({ type: () => CampaignPromotionResponseItemDto })
  promotion: CampaignPromotionResponseItemDto;
}

export class ListCampaignPromotionsResponseDto {
  @ApiProperty({ type: () => [CampaignPromotionResponseItemDto] })
  promotions: CampaignPromotionResponseItemDto[];
}
