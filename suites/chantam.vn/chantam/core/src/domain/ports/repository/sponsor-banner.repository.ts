import {
  BannerApprovalStatus,
  BannerDisplayType,
  BannerPlacement,
  BannerSourceType,
} from '@chantam.vn/chantam.core-lib/models';

export interface ISponsorBanner {
  readonly globalId: string;
  /** Banner từ đâu ra (15/11). Hàng trước 15/11 là `SPONSORED`. */
  readonly sourceType: BannerSourceType;
  /** `global_id` chiến dịch khi `sourceType = 'CAMPAIGN'`, còn lại `null`. */
  readonly sourceId: string | null;
  /** Người gửi đề xuất (chủ chiến dịch). `null` với banner Admin tạo. */
  readonly requestedBy: string | null;
  readonly displayType: BannerDisplayType;
  readonly partnerName: string;
  readonly partnerContact: string | null;
  readonly title: string;
  readonly imageUrl: string;
  readonly targetUrl: string;
  readonly placement: BannerPlacement;
  readonly displayOrder: number;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly isActive: boolean;
  readonly approvalStatus: BannerApprovalStatus;
  readonly approvalNote: string | null;
  readonly approvedAt: Date | null;
  readonly approvedBy: string | null;
  /**
   * Số lượt banner được TRẢ VỀ cho client, không phải số người đã nhìn thấy.
   *
   * Client prefetch hay người dùng cuộn qua mà không nhìn thì vẫn tính. Đọc nó thành "số
   * người đã xem" là đọc sai — muốn con số đó thì phải có tín hiệu viewport từ client, mà
   * UC-ADM-06 chỉ đòi "thống kê cơ bản".
   */
  readonly impressionCount: number;
  readonly clickCount: number;
  /** `null` khi chưa có lượt hiển thị nào. `0` ở đó đọc ra "không ai bấm", trong khi sự thật là chưa ai thấy. */
  readonly clickThroughRate: number | null;
  readonly createdBy: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface IWriteSponsorBannerParams {
  readonly partnerName: string;
  readonly partnerContact: string | null;
  readonly title: string;
  readonly imageUrl: string;
  readonly targetUrl: string;
  readonly placement: BannerPlacement;
  readonly displayType: BannerDisplayType;
  readonly displayOrder: number;
  readonly startsAt: Date;
  readonly endsAt: Date;
}

export interface ICreateSponsorBannerParams extends IWriteSponsorBannerParams {
  readonly createdBy: string;
  /** `CAMPAIGN` KHÔNG đi đường này — xem `createCampaignPromotion`. */
  readonly sourceType: 'ADMIN' | 'SPONSORED';
  readonly approvalStatus: BannerApprovalStatus;
  readonly approvedBy: string | null;
}

export interface ISponsorBannerPage {
  readonly items: ISponsorBanner[];
  readonly total: number;
}

/** Một dòng của danh sách Admin: banner kèm chiến dịch nguồn và người đề xuất. */
export interface ISponsorBannerAdminItem extends ISponsorBanner {
  readonly source: {
    readonly campaignId: string;
    readonly title: string;
    readonly slug: string;
  } | null;
  readonly requester: {
    readonly userId: string;
    readonly fullName: string | null;
  } | null;
}

export interface ISponsorBannerAdminPage {
  readonly items: ISponsorBannerAdminItem[];
  readonly total: number;
}

/** Trường owner sửa được trên đề xuất. Link và tên đối tác do server giữ. */
export type ICampaignPromotionChanges = Partial<
  Pick<
    IWriteSponsorBannerParams,
    | 'title'
    | 'imageUrl'
    | 'placement'
    | 'displayType'
    | 'displayOrder'
    | 'startsAt'
    | 'endsAt'
  >
>;

export interface ICreateCampaignPromotionParams {
  readonly campaignId: string;
  readonly requestedBy: string;
  readonly partnerName: string;
  readonly title: string;
  readonly imageUrl: string;
  readonly targetUrl: string;
  readonly placement: BannerPlacement;
  readonly displayType: BannerDisplayType;
  readonly displayOrder: number;
  readonly startsAt: Date;
  readonly endsAt: Date;
  /** Mốc "đang mở" đã chuẩn hoá từ cấu hình. */
  readonly maxOpen: number;
}

export type ICreateCampaignPromotionOutcome =
  | { readonly kind: 'CREATED'; readonly banner: ISponsorBanner }
  | { readonly kind: 'NOT_ELIGIBLE' }
  | { readonly kind: 'LIMIT_REACHED' };

export type IUpdateCampaignPromotionOutcome =
  | { readonly kind: 'UPDATED'; readonly banner: ISponsorBanner }
  | { readonly kind: 'NOT_FOUND' }
  | { readonly kind: 'NOT_ELIGIBLE' }
  | { readonly kind: 'LIMIT_REACHED' };

export type IDecideSponsorBannerOutcome =
  | { readonly kind: 'DECIDED'; readonly banner: ISponsorBanner }
  | { readonly kind: 'ALREADY_DECIDED' }
  | { readonly kind: 'CHANGED' }
  | { readonly kind: 'NOT_FOUND' };

export interface ISponsorBannerRepository {
  create(params: ICreateSponsorBannerParams): Promise<ISponsorBanner>;

  findByGlobalId(globalId: string): Promise<ISponsorBanner | null>;

  /**
   * Banner đang được phục vụ cho một vị trí.
   *
   * Lọc đủ BỐN điều kiện: đã duyệt, còn bật, chưa xoá, và **đang trong khung giờ**. Thiếu
   * điều kiện cuối là chạy banner của một hợp đồng đã hết — tức phát miễn phí cho đối tác
   * cũ và chiếm chỗ của đối tác đang trả tiền.
   *
   * Mốc so là `now()` của database, không phải giờ máy Node.
   *
   * Từ 15/11 thêm điều kiện thứ năm cho banner nguồn `CAMPAIGN`: chiến dịch nguồn vẫn đã
   * duyệt, còn mở và chưa xoá. Đóng/đình chỉ/xoá chiến dịch là banner rời app ngay.
   */
  findServing(params: {
    readonly placement: BannerPlacement;
    readonly limit: number;
  }): Promise<ISponsorBanner[]>;

  listForAdmin(query: {
    readonly limit: number;
    readonly offset: number;
    readonly placement?: BannerPlacement;
    readonly approvalStatus?: BannerApprovalStatus;
    readonly sourceType?: BannerSourceType;
    readonly sourceId?: string;
  }): Promise<ISponsorBannerAdminPage>;

  update(params: {
    readonly bannerId: string;
    readonly changes: Partial<IWriteSponsorBannerParams>;
  }): Promise<ISponsorBanner | null>;

  /**
   * Duyệt hoặc từ chối.
   *
   * Chỉ đổi khi còn `PENDING_APPROVAL`. Lượt kiểm đó nằm trong `WHERE` của chính câu
   * `UPDATE`, không phải một lượt đọc trước đó: hai Admin bấm cùng lúc thì người sau phải
   * thấy xung đột. `expectedUpdatedAt` (15/11) thêm một điều kiện cùng câu: owner sửa sau khi
   * Admin mở thì lượt duyệt KHÔNG ăn vào bản Admin chưa xem.
   */
  decideApproval(params: {
    readonly bannerId: string;
    readonly approverId: string;
    readonly approve: boolean;
    readonly note: string | null;
    readonly expectedUpdatedAt: Date | null;
  }): Promise<IDecideSponsorBannerOutcome>;

  /**
   * Tạo đề xuất từ chiến dịch, trong MỘT transaction khoá hàng `campaigns`.
   *
   * Khoá `FOR UPDATE` trên chiến dịch là thứ giữ mốc: hai lượt gửi song song khi còn đúng một
   * suất thì lượt sau phải đếm thấy hàng của lượt trước.
   */
  createCampaignPromotion(
    params: ICreateCampaignPromotionParams,
  ): Promise<ICreateCampaignPromotionOutcome>;

  /** Đề xuất của một chiến dịch, chưa xoá, mới nhất trước. */
  listByCampaign(campaignId: string): Promise<ISponsorBanner[]>;

  /** `null` khi id không thuộc chiến dịch này, không phải đề xuất, hoặc đã xoá. */
  findCampaignPromotion(
    campaignId: string,
    promotionId: string,
  ): Promise<ISponsorBanner | null>;

  /**
   * Owner sửa đề xuất: luôn quay về `PENDING_APPROVAL` (chốt 15/11). Cùng khoá hàng
   * `campaigns` như lúc tạo; hàng đang "không tính" (bị từ chối / đã hết hạn) mà sửa xong sẽ
   * "đang mở" thì phải còn suất.
   */
  updateCampaignPromotion(params: {
    readonly campaignId: string;
    readonly promotionId: string;
    readonly changes: ICampaignPromotionChanges;
    readonly maxOpen: number;
  }): Promise<IUpdateCampaignPromotionOutcome>;

  setActive(params: {
    readonly bannerId: string;
    readonly isActive: boolean;
  }): Promise<ISponsorBanner | null>;

  softDelete(bannerId: string): Promise<boolean>;

  /**
   * Cộng dồn lượt hiển thị cho NHIỀU banner trong MỘT câu.
   *
   * Một lượt mở Home trả về cả dải banner, nên đếm từng cái một là N lượt round-trip cho
   * một request. `UPDATE ... WHERE global_id = ANY($1)` làm trong một lượt.
   *
   * Cộng bằng `count = count + 1` trong database, KHÔNG đọc-rồi-ghi: hai người mở Home cùng
   * lúc mà đọc-rồi-ghi thì một lượt hiển thị biến mất, và con số đối soát với đối tác bị
   * thiếu một cách không giải thích được.
   */
  recordImpressions(bannerIds: readonly string[]): Promise<void>;

  /** `false` khi banner không tồn tại hoặc không còn được phục vụ. */
  recordClick(bannerId: string): Promise<boolean>;
}

export const ISponsorBannerRepository = Symbol('ISponsorBannerRepository');
