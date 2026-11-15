import {
  ISponsorBanner,
  ISponsorBannerAdminItem,
} from '@/domain/ports/repository';
import {
  BannerApprovalStatus,
  BannerDisplayType,
  BannerPlacement,
  BannerSourceType,
} from '@chantam.vn/chantam.core-lib/models';
import { IUseCase } from '@chantam/service.common-lib';

/** Thân chung cho lượt tạo và lượt sửa. */
export interface IWriteSponsorBannerInput {
  readonly partnerName: string;
  readonly partnerContact?: string | null;
  readonly title: string;
  readonly imageUrl: string;
  readonly targetUrl: string;
  readonly placement: string;
  /** Bỏ trống khi tạo = mặc định theo vị trí (`defaultBannerDisplayType`). */
  readonly displayType?: string;
  readonly displayOrder?: number;
  readonly startsAt: string;
  readonly endsAt: string;
}

export interface ICreateSponsorBannerCommand extends IWriteSponsorBannerInput {
  readonly actorUserId: string;
  /** `ADMIN | SPONSORED`, mặc định `SPONSORED`. `CAMPAIGN` chỉ sinh từ đường owner. */
  readonly sourceType?: string;
}

export interface ICreateSponsorBannerUseCase extends IUseCase<
  ICreateSponsorBannerCommand,
  ISponsorBanner
> {}

export const ICreateSponsorBannerUseCase = Symbol(
  'ICreateSponsorBannerUseCase',
);

export interface IUpdateSponsorBannerCommand extends Partial<IWriteSponsorBannerInput> {
  readonly actorUserId: string;
  readonly bannerId: string;
}

export interface IUpdateSponsorBannerUseCase extends IUseCase<
  IUpdateSponsorBannerCommand,
  ISponsorBanner
> {}

export const IUpdateSponsorBannerUseCase = Symbol(
  'IUpdateSponsorBannerUseCase',
);

export interface IListAdminSponsorBannersCommand {
  readonly actorUserId: string;
  readonly limit: number;
  readonly offset: number;
  readonly placement?: BannerPlacement;
  readonly approvalStatus?: BannerApprovalStatus;
  readonly sourceType?: BannerSourceType;
  /** `global_id` chiến dịch nguồn — cho chi tiết chiến dịch phía Admin. */
  readonly sourceId?: string;
}

export interface ISponsorBannerPageResult {
  readonly items: ISponsorBannerAdminItem[];
  readonly total: number;
}

export interface IListAdminSponsorBannersUseCase extends IUseCase<
  IListAdminSponsorBannersCommand,
  ISponsorBannerPageResult
> {}

export const IListAdminSponsorBannersUseCase = Symbol(
  'IListAdminSponsorBannersUseCase',
);

export interface IDecideSponsorBannerApprovalCommand {
  readonly actorUserId: string;
  readonly bannerId: string;
  readonly approve: boolean;
  /** BẮT BUỘC khi từ chối (15/11) — owner cần biết vì sao để sửa. */
  readonly note?: string;
  /**
   * `updatedAt` của bản Admin đang xem (ISO). Có gửi mà hàng đã đổi → 409, để không duyệt
   * một nội dung chưa ai xem. Tuỳ chọn để FE cũ không gãy.
   */
  readonly expectedUpdatedAt?: string;
}

export interface IDecideSponsorBannerApprovalUseCase extends IUseCase<
  IDecideSponsorBannerApprovalCommand,
  ISponsorBanner
> {}

export const IDecideSponsorBannerApprovalUseCase = Symbol(
  'IDecideSponsorBannerApprovalUseCase',
);

export interface ISetSponsorBannerActiveCommand {
  readonly actorUserId: string;
  readonly bannerId: string;
  readonly isActive: boolean;
}

export interface ISetSponsorBannerActiveUseCase extends IUseCase<
  ISetSponsorBannerActiveCommand,
  ISponsorBanner
> {}

export const ISetSponsorBannerActiveUseCase = Symbol(
  'ISetSponsorBannerActiveUseCase',
);

export interface IDeleteSponsorBannerCommand {
  readonly actorUserId: string;
  readonly bannerId: string;
}

export interface IDeleteSponsorBannerResult {
  readonly deleted: true;
}

export interface IDeleteSponsorBannerUseCase extends IUseCase<
  IDeleteSponsorBannerCommand,
  IDeleteSponsorBannerResult
> {}

export const IDeleteSponsorBannerUseCase = Symbol(
  'IDeleteSponsorBannerUseCase',
);

/** Bộ trường banner trả cho người dùng cuối — KHÔNG có số liệu và thông tin đối tác. */
export interface IPublicSponsorBannerDto {
  readonly globalId: string;
  readonly title: string;
  readonly imageUrl: string;
  readonly targetUrl: string;
  readonly placement: BannerPlacement;
  readonly displayOrder: number;
  /**
   * Tên đối tác — hiện được, vì quảng cáo phải nói rõ của ai (và đó là yêu cầu pháp lý ở
   * nhiều nơi). Nhưng `partnerContact`, `impressionCount`, `clickCount` thì KHÔNG: số liệu
   * hiệu quả là dữ liệu thương mại giữa Bên A và đối tác.
   */
  readonly partnerName: string;
  /** Nguồn banner (15/11) — mobile dùng để biết banner đến từ đâu. */
  readonly sourceType: BannerSourceType;
  /** `global_id` chiến dịch khi nguồn là `CAMPAIGN`. */
  readonly sourceId: string | null;
  /** Cách dựng: `APP_SPLASH` luôn là `FULLSCREEN`. */
  readonly displayType: BannerDisplayType;
  readonly startsAt: Date;
  readonly endsAt: Date;
}

export interface IServeSponsorBannersCommand {
  readonly placement: BannerPlacement;
  readonly limit: number;
}

export interface IServeSponsorBannersResult {
  readonly banners: IPublicSponsorBannerDto[];
}

export interface IServeSponsorBannersUseCase extends IUseCase<
  IServeSponsorBannersCommand,
  IServeSponsorBannersResult
> {}

export const IServeSponsorBannersUseCase = Symbol(
  'IServeSponsorBannersUseCase',
);

export interface IRecordBannerClickCommand {
  readonly bannerId: string;
}

export interface IRecordBannerClickResult {
  /** Đích để client mở — trả lại từ server để client không phải tin bản sao đã cache. */
  readonly targetUrl: string;
}

export interface IRecordBannerClickUseCase extends IUseCase<
  IRecordBannerClickCommand,
  IRecordBannerClickResult
> {}

export const IRecordBannerClickUseCase = Symbol('IRecordBannerClickUseCase');
