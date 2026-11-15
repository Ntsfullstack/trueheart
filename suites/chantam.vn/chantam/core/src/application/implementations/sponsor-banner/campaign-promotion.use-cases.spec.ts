import {
  CampaignPromotionLimitReachedException,
  CampaignPromotionNotEligibleException,
  CampaignPromotionNotFoundException,
  CharityCampaignNotFoundException,
} from '@/domain/exceptions';
import { ISponsorBanner } from '@/domain/ports/repository';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import {
  CreateCampaignPromotionUseCase,
  ListCampaignPromotionsUseCase,
  UpdateCampaignPromotionUseCase,
} from './campaign-promotion.use-cases';

const OwnerId = 'owner-1';
const CampaignId = 'campaign-1';
const Hour = 3_600_000;

function promotionRow(overrides: Partial<ISponsorBanner> = {}): ISponsorBanner {
  return {
    globalId: 'promo-1',
    sourceType: 'CAMPAIGN',
    sourceId: CampaignId,
    requestedBy: OwnerId,
    displayType: 'BANNER',
    partnerName: 'Áo ấm vùng cao',
    partnerContact: null,
    title: 'Chung tay áo ấm',
    imageUrl: 'https://cdn.chantam.vn/promo.jpg',
    targetUrl: `chantam://campaign/${CampaignId}`,
    placement: 'HOME_INLINE',
    displayOrder: 1,
    startsAt: new Date(Date.now() - Hour),
    endsAt: new Date(Date.now() + Hour),
    isActive: true,
    approvalStatus: 'PENDING_APPROVAL',
    approvalNote: null,
    approvedAt: null,
    approvedBy: null,
    impressionCount: 10,
    clickCount: 2,
    clickThroughRate: 20,
    createdBy: OwnerId,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeDeps(
  campaign: Record<string, unknown> | null = {
    globalId: CampaignId,
    title: 'Áo ấm vùng cao',
    createdBy: OwnerId,
    approvalStatus: 'APPROVED',
    isActive: true,
  },
) {
  return {
    banners: {
      createCampaignPromotion: jest.fn(async () => ({
        kind: 'CREATED' as const,
        banner: promotionRow(),
      })),
      updateCampaignPromotion: jest.fn(async () => ({
        kind: 'UPDATED' as const,
        banner: promotionRow(),
      })),
      listByCampaign: jest.fn(async () => [promotionRow()]),
      findCampaignPromotion: jest.fn(async () => promotionRow()),
    },
    campaigns: { findByGlobalId: jest.fn(async () => campaign) },
    storage: {
      confirmCampaignMediaUpload: jest.fn(async () => ({
        mediaType: 'IMAGE' as const,
        publicUrl: 'https://cdn.chantam.vn/users/owner-1/promo.jpg',
      })),
    },
    config: { getConfigValue: jest.fn(async () => 3 as unknown) },
  };
}

type Deps = ReturnType<typeof makeDeps>;

const create = (deps: Deps) =>
  new CreateCampaignPromotionUseCase(
    deps.banners as never,
    deps.campaigns as never,
    deps.storage as never,
    deps.config as never,
  );
const update = (deps: Deps) =>
  new UpdateCampaignPromotionUseCase(
    deps.banners as never,
    deps.campaigns as never,
    deps.storage as never,
    deps.config as never,
  );
const list = (deps: Deps) =>
  new ListCampaignPromotionsUseCase(
    deps.banners as never,
    deps.campaigns as never,
  );

function input(overrides: Record<string, unknown> = {}) {
  return {
    title: '  Chung tay áo ấm  ',
    imageKey: 'users/owner-1/promo.jpg',
    placement: 'HOME_INLINE',
    displayType: 'BANNER',
    startsAt: new Date(Date.now() + Hour).toISOString(),
    endsAt: new Date(Date.now() + 48 * Hour).toISOString(),
    ...overrides,
  };
}

const createCommand = (overrides: Record<string, unknown> = {}) => ({
  actorUserId: OwnerId,
  campaignId: CampaignId,
  promotion: input(overrides) as never,
});

describe('CreateCampaignPromotionUseCase', () => {
  it('chiến dịch không tồn tại -> CharityCampaignNotFound', async () => {
    const deps = makeDeps(null);
    await expect(create(deps).handle(createCommand())).rejects.toThrow(
      CharityCampaignNotFoundException,
    );
  });

  it('không phải chủ chiến dịch -> Forbidden, không đụng storage', async () => {
    const deps = makeDeps();
    await expect(
      create(deps).handle({ ...createCommand(), actorUserId: 'ke-khac' }),
    ).rejects.toThrow(ForbiddenException);
    expect(deps.storage.confirmCampaignMediaUpload).not.toHaveBeenCalled();
  });

  it.each([
    [{ approvalStatus: 'PENDING_APPROVAL' }],
    [{ approvalStatus: 'REJECTED' }],
    [{ isActive: false }],
  ])('chiến dịch %p -> NotEligible', async (state) => {
    const deps = makeDeps({
      globalId: CampaignId,
      title: 'x',
      createdBy: OwnerId,
      approvalStatus: 'APPROVED',
      isActive: true,
      ...state,
    });
    await expect(create(deps).handle(createCommand())).rejects.toThrow(
      CampaignPromotionNotEligibleException,
    );
  });

  it('cặp vị trí–kiểu sai -> 400 TRƯỚC khi gọi storage', async () => {
    const deps = makeDeps();
    await expect(
      create(deps).handle(
        createCommand({ placement: 'APP_SPLASH', displayType: 'BANNER' }),
      ),
    ).rejects.toThrow(ValidationFailedException);
    expect(deps.storage.confirmCampaignMediaUpload).not.toHaveBeenCalled();
  });

  it('endsAt không sau startsAt -> 400', async () => {
    const deps = makeDeps();
    const at = new Date(Date.now() + Hour).toISOString();
    await expect(
      create(deps).handle(createCommand({ startsAt: at, endsAt: at })),
    ).rejects.toThrow(ValidationFailedException);
  });

  it('key là video -> 400, không ghi', async () => {
    const deps = makeDeps();
    deps.storage.confirmCampaignMediaUpload.mockResolvedValue({
      mediaType: 'VIDEO' as never,
      publicUrl: 'https://cdn.chantam.vn/a.mp4',
    });
    await expect(create(deps).handle(createCommand())).rejects.toThrow(
      ValidationFailedException,
    );
    expect(deps.banners.createCampaignPromotion).not.toHaveBeenCalled();
  });

  it('URL công khai của storage không phải https -> 400 nói rõ, không để CHECK ném 500', async () => {
    const deps = makeDeps();
    deps.storage.confirmCampaignMediaUpload.mockResolvedValue({
      mediaType: 'IMAGE',
      publicUrl: 'http://localhost:9000/promo.jpg',
    });
    await expect(create(deps).handle(createCommand())).rejects.toThrow(
      ValidationFailedException,
    );
    expect(deps.banners.createCampaignPromotion).not.toHaveBeenCalled();
  });

  it('thành công: server dựng link, tên đối tác, người đề xuất; xác minh ảnh theo người gửi', async () => {
    const deps = makeDeps();

    const result = await create(deps).handle(createCommand());

    expect(deps.storage.confirmCampaignMediaUpload).toHaveBeenCalledWith(
      OwnerId,
      'users/owner-1/promo.jpg',
    );
    expect(deps.banners.createCampaignPromotion).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: CampaignId,
        requestedBy: OwnerId,
        partnerName: 'Áo ấm vùng cao',
        title: 'Chung tay áo ấm',
        imageUrl: 'https://cdn.chantam.vn/users/owner-1/promo.jpg',
        targetUrl: `chantam://campaign/${CampaignId}`,
        placement: 'HOME_INLINE',
        displayType: 'BANNER',
        displayOrder: 1,
        maxOpen: 3,
      }),
    );
    expect(result.promotion).not.toHaveProperty('impressionCount');
    expect(result.promotion.servingState).toBe('PENDING');
  });

  it('tên chiến dịch dài hơn 200 ký tự -> partnerName cắt về 200', async () => {
    const deps = makeDeps({
      globalId: CampaignId,
      title: 'a'.repeat(250),
      createdBy: OwnerId,
      approvalStatus: 'APPROVED',
      isActive: true,
    });
    await create(deps).handle(createCommand());
    const [params] = deps.banners.createCampaignPromotion.mock
      .calls[0] as unknown as [{ partnerName: string }];
    expect(params.partnerName).toHaveLength(200);
  });

  it.each([
    [7, 7],
    ['rác', 3],
    [null, 3],
  ])(
    'mốc cấu hình %p -> repository nhận %p, lỗi nêu đúng con số',
    async (raw, expected) => {
      const deps = makeDeps();
      deps.config.getConfigValue.mockResolvedValue(raw as unknown);
      deps.banners.createCampaignPromotion.mockResolvedValue({
        kind: 'LIMIT_REACHED',
      } as never);

      await expect(create(deps).handle(createCommand())).rejects.toThrow(
        new RegExp(`tối đa ${expected} đề xuất`),
      );
      expect(deps.banners.createCampaignPromotion).toHaveBeenCalledWith(
        expect.objectContaining({ maxOpen: expected }),
      );
      await expect(create(deps).handle(createCommand())).rejects.toThrow(
        CampaignPromotionLimitReachedException,
      );
    },
  );

  it('repository báo NOT_ELIGIBLE (chiến dịch vừa đóng giữa chừng) -> NotEligible', async () => {
    const deps = makeDeps();
    deps.banners.createCampaignPromotion.mockResolvedValue({
      kind: 'NOT_ELIGIBLE',
    } as never);
    await expect(create(deps).handle(createCommand())).rejects.toThrow(
      CampaignPromotionNotEligibleException,
    );
  });
});

describe('UpdateCampaignPromotionUseCase', () => {
  const command = (promotion: Record<string, unknown>) => ({
    actorUserId: OwnerId,
    campaignId: CampaignId,
    promotionId: 'promo-1',
    promotion: promotion as never,
  });

  it('body rỗng -> 400', async () => {
    const deps = makeDeps();
    await expect(update(deps).handle(command({}))).rejects.toThrow(
      ValidationFailedException,
    );
  });

  it('[RF4] đề xuất không thuộc chiến dịch này -> CampaignPromotionNotFound', async () => {
    const deps = makeDeps();
    deps.banners.findCampaignPromotion.mockResolvedValue(null as never);
    await expect(
      update(deps).handle(command({ title: 'Mới' })),
    ).rejects.toThrow(CampaignPromotionNotFoundException);
  });

  it('[RF3] cặp vị trí–kiểu sau khi trộn sai -> 400, không ghi', async () => {
    const deps = makeDeps();
    await expect(
      update(deps).handle(command({ placement: 'APP_SPLASH' })),
    ).rejects.toThrow(ValidationFailedException);
    expect(deps.banners.updateCampaignPromotion).not.toHaveBeenCalled();
  });

  it('gửi imageKey mới -> xác minh lại qua storage', async () => {
    const deps = makeDeps();
    await update(deps).handle(command({ imageKey: 'users/owner-1/moi.jpg' }));
    expect(deps.storage.confirmCampaignMediaUpload).toHaveBeenCalledWith(
      OwnerId,
      'users/owner-1/moi.jpg',
    );
    expect(deps.banners.updateCampaignPromotion).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: { imageUrl: 'https://cdn.chantam.vn/users/owner-1/promo.jpg' },
        maxOpen: 3,
      }),
    );
  });

  it('không phải chủ -> Forbidden', async () => {
    const deps = makeDeps();
    await expect(
      update(deps).handle({
        ...command({ title: 'x' }),
        actorUserId: 'ke-khac',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it.each([
    ['NOT_FOUND', CampaignPromotionNotFoundException],
    ['NOT_ELIGIBLE', CampaignPromotionNotEligibleException],
    ['LIMIT_REACHED', CampaignPromotionLimitReachedException],
  ] as const)(
    'repository %s -> exception tương ứng',
    async (kind, exception) => {
      const deps = makeDeps();
      deps.banners.updateCampaignPromotion.mockResolvedValue({ kind } as never);
      await expect(
        update(deps).handle(command({ title: 'Mới' })),
      ).rejects.toThrow(exception);
    },
  );
});

describe('ListCampaignPromotionsUseCase', () => {
  it('chỉ chủ chiến dịch xem được', async () => {
    const deps = makeDeps();
    await expect(
      list(deps).handle({ actorUserId: 'ke-khac', campaignId: CampaignId }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('trả trạng thái hiển thị và lý do từ chối, không trả số liệu', async () => {
    const deps = makeDeps();
    deps.banners.listByCampaign.mockResolvedValue([
      promotionRow({ approvalStatus: 'REJECTED', approvalNote: 'Ảnh mờ' }),
    ]);

    const result = await list(deps).handle({
      actorUserId: OwnerId,
      campaignId: CampaignId,
    });

    expect(result.promotions[0]).toMatchObject({
      servingState: 'REJECTED',
      approvalNote: 'Ảnh mờ',
    });
    expect(result.promotions[0]).not.toHaveProperty('clickCount');
  });
});
