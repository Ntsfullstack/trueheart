import {
  AdminBannerSourceTypes,
  BannerApprovalStatuses,
  BannerDisplayTypes,
  BannerPlacements,
  BannerSourceTypes,
  MaxBannerPartnerNameLength,
  MaxBannerTitleLength,
  MaxBannerUrlLength,
} from '@chantam.vn/chantam.core-lib/models';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { NotNullWhenPresent } from '../not-null-when-present';

export class WriteSponsorBannerDto {
  @ApiProperty({
    example: 'Công ty TNHH An Lạc',
    maxLength: MaxBannerPartnerNameLength,
    description:
      'Đối tác tài trợ. Không biết banner của ai thì không đối soát được.',
  })
  @IsString()
  @Length(1, MaxBannerPartnerNameLength)
  partnerName: string;

  @ApiPropertyOptional({
    example: 'lienhe@anlac.vn',
    maxLength: MaxBannerPartnerNameLength,
    description: 'Đầu mối liên hệ của đối tác. KHÔNG trả ra đường công khai.',
  })
  @IsOptional()
  @IsString()
  @Length(1, MaxBannerPartnerNameLength)
  partnerContact?: string;

  @ApiProperty({
    example: 'Mùa Vu Lan An Lạc',
    maxLength: MaxBannerTitleLength,
  })
  @IsString()
  @Length(1, MaxBannerTitleLength)
  title: string;

  @ApiProperty({
    example: 'https://cdn.chantam.vn/banners/vu-lan.jpg',
    maxLength: MaxBannerUrlLength,
    description:
      'Bắt buộc `https://` — ảnh qua `http` làm trình duyệt chặn nội dung lẫn.',
  })
  @IsString()
  @Length(1, MaxBannerUrlLength)
  imageUrl: string;

  @ApiProperty({
    example: 'https://anlac.vn/vu-lan',
    maxLength: MaxBannerUrlLength,
    description:
      'CTA / deep link. Nhận `https://`, `chantam://` hoặc `givingapp://` — hai tên lược đồ app được nhận như nhau cho tới khi mobile chốt một. Lược đồ khác bị từ chối ở ' +
      'cả DTO và ràng buộc database — một link do đối tác gửi là đúng nơi để thử chèn mã.',
  })
  @IsString()
  @Length(1, MaxBannerUrlLength)
  targetUrl: string;

  @ApiProperty({
    enum: BannerPlacements,
    description:
      'Vị trí hiển thị. ALLOWLIST, không phải chuỗi tự do: một vị trí không client nào ' +
      'dựng nghĩa là banner không hiện ở đâu mà KHÔNG có lỗi nào — Admin thấy bản ghi đã ' +
      'lưu, đối tác đã trả tiền, và không ai biết nó chưa từng xuất hiện.',
  })
  @IsIn(BannerPlacements as readonly string[])
  placement: string;

  @ApiPropertyOptional({
    enum: BannerDisplayTypes,
    description:
      'Cách app dựng banner. Bỏ trống = theo vị trí (`HOME_HERO` → `SLIDER`, `APP_SPLASH` → ' +
      '`FULLSCREEN`, còn lại → `BANNER`). `APP_SPLASH` CHỈ đi với `FULLSCREEN` và ngược lại.',
  })
  @IsOptional()
  @IsIn(BannerDisplayTypes as readonly string[])
  displayType?: string;

  @ApiPropertyOptional({
    enum: AdminBannerSourceTypes,
    default: 'SPONSORED',
    description:
      'Nhãn nguồn để lọc: `SPONSORED` (đối tác) hoặc `ADMIN` (nội dung nền tảng). ' +
      '`CAMPAIGN` chỉ sinh từ đề xuất của chủ chiến dịch.',
  })
  @IsOptional()
  @IsIn(AdminBannerSourceTypes as readonly string[])
  sourceType?: string;

  @ApiPropertyOptional({
    minimum: 0,
    default: 1,
    description: 'Thứ tự trong cùng một vị trí, nhỏ hiện trước.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @ApiProperty({ example: '2026-08-01T00:00:00.000Z' })
  @IsISO8601()
  startsAt: string;

  @ApiProperty({
    example: '2026-09-01T00:00:00.000Z',
    description:
      'Phải sau `startsAt` — `CHK_sponsor_banners_window` canh ở database.',
  })
  @IsISO8601()
  endsAt: string;
}

export class WriteSponsorBannerBodyDto {
  @ApiProperty({ type: () => WriteSponsorBannerDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => WriteSponsorBannerDto)
  banner: WriteSponsorBannerDto;
}

/** Lượt sửa: mọi trường tuỳ chọn, và trường bỏ trống nghĩa là "không đổi". */
export class PatchSponsorBannerDto {
  @ApiPropertyOptional({ maxLength: MaxBannerPartnerNameLength })
  @NotNullWhenPresent()
  @IsString()
  @Length(1, MaxBannerPartnerNameLength)
  partnerName?: string;

  @ApiPropertyOptional({ maxLength: MaxBannerPartnerNameLength })
  @IsOptional()
  @IsString()
  @Length(1, MaxBannerPartnerNameLength)
  partnerContact?: string | null;

  @ApiPropertyOptional({ maxLength: MaxBannerTitleLength })
  @NotNullWhenPresent()
  @IsString()
  @Length(1, MaxBannerTitleLength)
  title?: string;

  @ApiPropertyOptional({ maxLength: MaxBannerUrlLength })
  @NotNullWhenPresent()
  @IsString()
  @Length(1, MaxBannerUrlLength)
  imageUrl?: string;

  @ApiPropertyOptional({ maxLength: MaxBannerUrlLength })
  @NotNullWhenPresent()
  @IsString()
  @Length(1, MaxBannerUrlLength)
  targetUrl?: string;

  @ApiPropertyOptional({ enum: BannerPlacements })
  @NotNullWhenPresent()
  @IsIn(BannerPlacements as readonly string[])
  placement?: string;

  @ApiPropertyOptional({
    enum: BannerDisplayTypes,
    description:
      'Cặp vị trí–kiểu được kiểm trên giá trị SAU khi trộn với bản đang lưu: đổi mỗi ' +
      '`placement` sang `APP_SPLASH` trên một banner `BANNER` là 400.',
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

  @ApiPropertyOptional({
    description:
      'Gửi một mốc lẻ thì phép so "sau startsAt" do ràng buộc database canh — mốc kia nằm ' +
      'trong database chứ không trong request.',
  })
  @NotNullWhenPresent()
  @IsISO8601()
  endsAt?: string;
}

export class PatchSponsorBannerBodyDto {
  @ApiProperty({ type: () => PatchSponsorBannerDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => PatchSponsorBannerDto)
  banner: PatchSponsorBannerDto;
}

export class ServeBannersQueryDto {
  @ApiProperty({ enum: BannerPlacements })
  @IsIn(BannerPlacements as readonly string[])
  placement: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 20, default: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}

export class ListAdminBannersQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @ApiPropertyOptional({ enum: BannerPlacements })
  @IsOptional()
  @IsIn(BannerPlacements as readonly string[])
  placement?: string;

  @ApiPropertyOptional({ enum: BannerApprovalStatuses })
  @IsOptional()
  @IsIn(BannerApprovalStatuses as readonly string[])
  approvalStatus?: string;

  @ApiPropertyOptional({ enum: BannerSourceTypes })
  @IsOptional()
  @IsIn(BannerSourceTypes as readonly string[])
  sourceType?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      '`global_id` chiến dịch nguồn — để chi tiết chiến dịch phía Admin liệt kê đề xuất của nó.',
  })
  @IsOptional()
  @IsUUID()
  sourceId?: string;
}

export class BannerIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id: string;
}

export class DecideBannerApprovalDto {
  @ApiProperty({ description: '`true` duyệt · `false` từ chối.' })
  @IsBoolean()
  approve: boolean;

  @ApiPropertyOptional({
    maxLength: 1_000,
    description:
      'BẮT BUỘC khi `approve: false` — owner cần biết vì sao để sửa.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 1_000)
  note?: string;

  @ApiPropertyOptional({
    example: '2026-11-15T08:30:00.123Z',
    description:
      '`updatedAt` của bản Admin đang xem. Gửi kèm thì nội dung đổi sau khi mở sẽ trả 409 ' +
      '`SPONSOR_BANNER_CHANGED_SINCE_VIEWED` thay vì duyệt một bản chưa ai xem. FE nên gửi.',
  })
  @IsOptional()
  @IsISO8601()
  expectedUpdatedAt?: string;
}

export class DecideBannerApprovalBodyDto {
  @ApiProperty({ type: () => DecideBannerApprovalDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => DecideBannerApprovalDto)
  approval: DecideBannerApprovalDto;
}

export class SetBannerActiveDto {
  @ApiProperty()
  @IsBoolean()
  isActive: boolean;
}

export class SetBannerActiveBodyDto {
  @ApiProperty({ type: () => SetBannerActiveDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => SetBannerActiveDto)
  banner: SetBannerActiveDto;
}

export class BannerSourceCampaignDto {
  @ApiProperty({ format: 'uuid' }) campaignId: string;
  @ApiProperty() title: string;
  @ApiProperty() slug: string;
}

export class BannerRequesterDto {
  @ApiProperty({ format: 'uuid' }) userId: string;
  @ApiProperty({ type: String, nullable: true }) fullName: string | null;
}

export class AdminBannerResponseDto {
  @ApiProperty() globalId: string;

  @ApiProperty({ enum: BannerSourceTypes })
  sourceType: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  sourceId: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  requestedBy: string | null;

  @ApiPropertyOptional({
    type: () => BannerSourceCampaignDto,
    nullable: true,
    description:
      'Chiến dịch nguồn — chỉ có ở danh sách, khi `sourceType = CAMPAIGN`.',
  })
  source?: BannerSourceCampaignDto | null;

  @ApiPropertyOptional({
    type: () => BannerRequesterDto,
    nullable: true,
    description: 'Người đề xuất — chỉ có ở danh sách.',
  })
  requester?: BannerRequesterDto | null;

  @ApiProperty({ enum: BannerDisplayTypes })
  displayType: string;

  @ApiProperty() partnerName: string;
  @ApiProperty({ nullable: true }) partnerContact: string | null;
  @ApiProperty() title: string;
  @ApiProperty() imageUrl: string;
  @ApiProperty() targetUrl: string;

  @ApiProperty({ enum: BannerPlacements })
  placement: string;

  @ApiProperty() displayOrder: number;
  @ApiProperty() startsAt: Date;
  @ApiProperty() endsAt: Date;
  @ApiProperty() isActive: boolean;

  @ApiProperty({ enum: BannerApprovalStatuses })
  approvalStatus: string;

  @ApiProperty({ nullable: true }) approvalNote: string | null;
  @ApiProperty({ nullable: true }) approvedAt: Date | null;
  @ApiProperty({ nullable: true }) approvedBy: string | null;

  @ApiProperty({
    description:
      'Số lượt banner được TRẢ VỀ cho client — không phải số người đã nhìn thấy. Client ' +
      'prefetch hay người dùng cuộn qua mà không nhìn thì vẫn tính.',
  })
  impressionCount: number;

  @ApiProperty() clickCount: number;

  @ApiProperty({
    nullable: true,
    description:
      'Phần trăm, hai chữ số thập phân. `null` khi chưa có lượt hiển thị nào — `0` ở đó ' +
      'đọc ra "không ai bấm", trong khi sự thật là chưa ai thấy.',
  })
  clickThroughRate: number | null;

  @ApiProperty({ nullable: true }) createdBy: string | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class PublicBannerResponseDto {
  @ApiProperty() globalId: string;
  @ApiProperty() title: string;
  @ApiProperty() imageUrl: string;
  @ApiProperty() targetUrl: string;

  @ApiProperty({ enum: BannerPlacements })
  placement: string;

  @ApiProperty() displayOrder: number;

  @ApiProperty({
    description:
      'Tên đối tác — hiện được, vì quảng cáo phải nói rõ của ai. Nhưng `partnerContact` ' +
      'và toàn bộ số liệu hiệu quả thì KHÔNG: đó là dữ liệu thương mại giữa Bên A và đối tác.',
  })
  partnerName: string;

  @ApiProperty({
    enum: BannerSourceTypes,
    description:
      'Banner từ đâu: đối tác, nền tảng, hay chiến dịch từ thiện đề xuất.',
  })
  sourceType: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: '`global_id` chiến dịch khi `sourceType = CAMPAIGN`.',
  })
  sourceId: string | null;

  @ApiProperty({
    enum: BannerDisplayTypes,
    description: 'Cách dựng. `APP_SPLASH` luôn là `FULLSCREEN`.',
  })
  displayType: string;

  @ApiProperty() startsAt: Date;
  @ApiProperty() endsAt: Date;
}

export class ServeBannersResponseDto {
  @ApiProperty({ type: () => [PublicBannerResponseDto] })
  banners: PublicBannerResponseDto[];
}

export class ListAdminBannersResponseDto {
  @ApiProperty({ type: () => [AdminBannerResponseDto] })
  items: AdminBannerResponseDto[];

  @ApiProperty() total: number;
}

export class AdminBannerWrapperResponseDto {
  @ApiProperty({ type: () => AdminBannerResponseDto })
  banner: AdminBannerResponseDto;
}

export class BannerClickResponseDto {
  @ApiProperty({
    description:
      'Đích để client mở. Trả lại từ server để client không phải tin bản sao đã cache — ' +
      'Admin đổi link của một banner đang chạy thì lượt bấm tiếp theo đi đúng link mới.',
  })
  targetUrl: string;
}

export class DeleteBannerResponseDto {
  @ApiProperty() deleted: boolean;
}
