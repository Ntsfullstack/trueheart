import {
  SponsorBannerApprovalAlreadyDecidedException,
  SponsorBannerChangedSinceViewedException,
  SponsorBannerNotFoundException,
  SponsorBannerNotServingException,
} from '@/domain/exceptions';
import {
  IAdminConfigRepository,
  ISponsorBanner,
  ISponsorBannerRepository,
} from '@/domain/ports/repository';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import {
  CreateSponsorBannerUseCase,
  DecideSponsorBannerApprovalUseCase,
  ListAdminSponsorBannersUseCase,
  RecordBannerClickUseCase,
  ServeSponsorBannersUseCase,
  UpdateSponsorBannerUseCase,
} from './sponsor-banner.use-cases';

const ActorId = 'actor';
const Hour = 3_600_000;

function banner(overrides: Partial<ISponsorBanner> = {}): ISponsorBanner {
  const startsAt = new Date(Date.now() - Hour);
  return {
    globalId: 'banner-1',
    sourceType: 'SPONSORED',
    sourceId: null,
    requestedBy: null,
    displayType: 'SLIDER',
    partnerName: 'Công ty TNHH An Lạc',
    partnerContact: 'lienhe@anlac.vn',
    title: 'Mùa Vu Lan An Lạc',
    imageUrl: 'https://cdn.chantam.vn/banners/vu-lan.jpg',
    targetUrl: 'https://anlac.vn/vu-lan',
    placement: 'HOME_HERO',
    displayOrder: 1,
    startsAt,
    endsAt: new Date(startsAt.getTime() + 30 * 24 * Hour),
    isActive: true,
    approvalStatus: 'APPROVED',
    approvalNote: null,
    approvedAt: new Date(),
    approvedBy: ActorId,
    impressionCount: 0,
    clickCount: 0,
    clickThroughRate: null,
    createdBy: ActorId,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeRepository(): jest.Mocked<ISponsorBannerRepository> {
  return {
    create: jest.fn().mockResolvedValue(banner()),
    // Lượt sửa đọc hàng đang lưu trước (cặp vị trí–kiểu sau khi trộn, khoá trường của hàng
    // CAMPAIGN). Mặc định trả một banner đối tác hợp lệ.
    findByGlobalId: jest.fn().mockResolvedValue(banner()),
    findServing: jest.fn().mockResolvedValue([]),
    listForAdmin: jest.fn(),
    update: jest.fn(),
    decideApproval: jest.fn(),
    setActive: jest.fn(),
    softDelete: jest.fn(),
    recordImpressions: jest.fn().mockResolvedValue(undefined),
    recordClick: jest.fn(),
    createCampaignPromotion: jest.fn(),
    listByCampaign: jest.fn(),
    findCampaignPromotion: jest.fn(),
    updateCampaignPromotion: jest.fn(),
  } as unknown as jest.Mocked<ISponsorBannerRepository>;
}

function makeAdmin(granted: boolean) {
  return {
    hasPermission: jest.fn().mockResolvedValue(granted),
  } as unknown as jest.Mocked<IAdminConfigRepository>;
}

function writeInput(overrides: Record<string, unknown> = {}) {
  const startsAt = new Date(Date.now() + Hour);
  return {
    partnerName: 'Công ty TNHH An Lạc',
    title: 'Mùa Vu Lan An Lạc',
    imageUrl: 'https://cdn.chantam.vn/banners/vu-lan.jpg',
    targetUrl: 'https://anlac.vn/vu-lan',
    placement: 'HOME_HERO',
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + 30 * 24 * Hour).toISOString(),
    ...overrides,
  };
}

describe('CreateSponsorBannerUseCase', () => {
  it('đòi banner.manage, không đòi campaign.manage', async () => {
    const repository = makeRepository();
    const admin = makeAdmin(true);

    await new CreateSponsorBannerUseCase(repository, admin).handle({
      ...writeInput(),
      actorUserId: ActorId,
    });

    // Cặp quyền RIÊNG: duyệt banner là hành vi thương mại, khác biên tập bố cục Home.
    expect(admin.hasPermission).toHaveBeenCalledWith(ActorId, 'banner.manage');
  });

  it('không có quyền thì ForbiddenException và KHÔNG ghi gì', async () => {
    const repository = makeRepository();
    await expect(
      new CreateSponsorBannerUseCase(repository, makeAdmin(false)).handle({
        ...writeInput(),
        actorUserId: ActorId,
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('kiểm quyền TRƯỚC khi kiểm nội dung', async () => {
    // Người không được tạo gửi banner rác phải nhận 403, không phải một danh sách lỗi nội
    // dung tiết lộ rằng sửa xong thì sẽ tạo được.
    await expect(
      new CreateSponsorBannerUseCase(makeRepository(), makeAdmin(false)).handle(
        {
          ...writeInput({ targetUrl: 'javascript:alert(1)', partnerName: '' }),
          actorUserId: ActorId,
        },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('Phase 1 vào thẳng APPROVED, approvedBy là người tạo', async () => {
    const repository = makeRepository();

    await new CreateSponsorBannerUseCase(repository, makeAdmin(true)).handle({
      ...writeInput(),
      actorUserId: ActorId,
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        approvalStatus: 'APPROVED',
        approvedBy: ActorId,
        createdBy: ActorId,
      }),
    );
  });

  it('displayOrder mặc định 1, partnerContact mặc định null', async () => {
    const repository = makeRepository();

    await new CreateSponsorBannerUseCase(repository, makeAdmin(true)).handle({
      ...writeInput(),
      actorUserId: ActorId,
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ displayOrder: 1, partnerContact: null }),
    );
  });

  it('targetUrl javascript: bị từ chối', async () => {
    const repository = makeRepository();
    await expect(
      new CreateSponsorBannerUseCase(repository, makeAdmin(true)).handle({
        ...writeInput({ targetUrl: 'javascript:alert(1)' }),
        actorUserId: ActorId,
      }),
    ).rejects.toThrow(ValidationFailedException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('vị trí ngoài allowlist bị từ chối', async () => {
    await expect(
      new CreateSponsorBannerUseCase(makeRepository(), makeAdmin(true)).handle({
        ...writeInput({ placement: 'trang-chu' }),
        actorUserId: ActorId,
      }),
    ).rejects.toThrow(ValidationFailedException);
  });
});

describe('UpdateSponsorBannerUseCase', () => {
  it('chỉ gửi những trường có mặt xuống repository', async () => {
    const repository = makeRepository();
    repository.update.mockResolvedValue(banner({ title: 'Tên mới' }));

    await new UpdateSponsorBannerUseCase(repository, makeAdmin(true)).handle({
      actorUserId: ActorId,
      bannerId: 'banner-1',
      title: 'Tên mới',
    });

    expect(repository.update).toHaveBeenCalledWith({
      bannerId: 'banner-1',
      changes: { title: 'Tên mới' },
    });
  });

  it('partnerContact: null là "xoá liên hệ", không ném lỗi trên .trim() (CMS B12)', async () => {
    const repository = makeRepository();
    repository.update.mockResolvedValue(banner());

    await new UpdateSponsorBannerUseCase(repository, makeAdmin(true)).handle({
      actorUserId: ActorId,
      bannerId: 'banner-1',
      partnerContact: null,
    });

    expect(repository.update).toHaveBeenCalledWith({
      bannerId: 'banner-1',
      changes: { partnerContact: null },
    });
  });

  it('gửi MỘT mốc lẻ thì không tự ném — ràng buộc database là lớp chặn', async () => {
    // Mốc kia nằm trong database chứ không trong request, nên use case không có cơ sở để
    // so. Ném ở đây là từ chối một lượt sửa hợp lệ.
    const repository = makeRepository();
    repository.update.mockResolvedValue(banner());

    await new UpdateSponsorBannerUseCase(repository, makeAdmin(true)).handle({
      actorUserId: ActorId,
      bannerId: 'banner-1',
      endsAt: new Date(Date.now() + 99 * Hour).toISOString(),
    });

    expect(repository.update).toHaveBeenCalled();
  });

  it('gửi CẢ HAI mốc sai thứ tự thì ném ngay', async () => {
    const repository = makeRepository();
    const now = Date.now();
    await expect(
      new UpdateSponsorBannerUseCase(repository, makeAdmin(true)).handle({
        actorUserId: ActorId,
        bannerId: 'banner-1',
        startsAt: new Date(now + 2 * Hour).toISOString(),
        endsAt: new Date(now + Hour).toISOString(),
      }),
    ).rejects.toThrow(ValidationFailedException);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('banner không tồn tại thì NotFound', async () => {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(null);
    repository.update.mockResolvedValue(null);

    await expect(
      new UpdateSponsorBannerUseCase(repository, makeAdmin(true)).handle({
        actorUserId: ActorId,
        bannerId: 'khong-co',
        title: 'x',
      }),
    ).rejects.toThrow(SponsorBannerNotFoundException);
  });
});

describe('Banner nguồn và kiểu hiển thị (15/11)', () => {
  it('Admin tạo không gửi displayType -> mặc định theo vị trí, nguồn mặc định SPONSORED', async () => {
    const repository = makeRepository();

    await new CreateSponsorBannerUseCase(repository, makeAdmin(true)).handle({
      actorUserId: ActorId,
      ...writeInput({ placement: 'HOME_HERO' }),
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        displayType: 'SLIDER',
        sourceType: 'SPONSORED',
      }),
    );
  });

  it('Admin tạo chọn nguồn ADMIN được', async () => {
    const repository = makeRepository();

    await new CreateSponsorBannerUseCase(repository, makeAdmin(true)).handle({
      actorUserId: ActorId,
      ...writeInput({ sourceType: 'ADMIN', displayType: 'BANNER' }),
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: 'ADMIN', displayType: 'BANNER' }),
    );
  });

  it.each([
    [{ placement: 'APP_SPLASH', displayType: 'BANNER' }],
    [{ placement: 'HOME_HERO', displayType: 'FULLSCREEN' }],
    [{ sourceType: 'CAMPAIGN' }],
  ])('Admin tạo với %p -> 400, không ghi gì', async (overrides) => {
    const repository = makeRepository();

    await expect(
      new CreateSponsorBannerUseCase(repository, makeAdmin(true)).handle({
        actorUserId: ActorId,
        ...writeInput(overrides),
      }),
    ).rejects.toThrow(ValidationFailedException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('[RF3] sửa một phần chỉ đổi placement sang APP_SPLASH trên hàng BANNER -> 400', async () => {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(
      banner({ placement: 'HOME_INLINE', displayType: 'BANNER' }),
    );

    await expect(
      new UpdateSponsorBannerUseCase(repository, makeAdmin(true)).handle({
        actorUserId: ActorId,
        bannerId: 'banner-1',
        placement: 'APP_SPLASH',
      }),
    ).rejects.toThrow(ValidationFailedException);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('đổi cả placement APP_SPLASH lẫn displayType FULLSCREEN thì được', async () => {
    const repository = makeRepository();
    repository.update.mockResolvedValue(banner());

    await new UpdateSponsorBannerUseCase(repository, makeAdmin(true)).handle({
      actorUserId: ActorId,
      bannerId: 'banner-1',
      placement: 'APP_SPLASH',
      displayType: 'FULLSCREEN',
    });

    expect(repository.update).toHaveBeenCalledWith({
      bannerId: 'banner-1',
      changes: { placement: 'APP_SPLASH', displayType: 'FULLSCREEN' },
    });
  });

  it.each(['targetUrl', 'partnerName', 'partnerContact'])(
    'hàng CAMPAIGN: Admin không đổi được %s',
    async (field) => {
      const repository = makeRepository();
      repository.findByGlobalId.mockResolvedValue(
        banner({ sourceType: 'CAMPAIGN', sourceId: 'campaign-1' }),
      );

      await expect(
        new UpdateSponsorBannerUseCase(repository, makeAdmin(true)).handle({
          actorUserId: ActorId,
          bannerId: 'banner-1',
          [field]: field === 'targetUrl' ? 'https://khac.vn' : 'Đối tác khác',
        }),
      ).rejects.toThrow(ValidationFailedException);
      expect(repository.update).not.toHaveBeenCalled();
    },
  );

  it('hàng CAMPAIGN: Admin đổi thứ tự được, không đụng trạng thái duyệt', async () => {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(
      banner({ sourceType: 'CAMPAIGN', sourceId: 'campaign-1' }),
    );
    repository.update.mockResolvedValue(banner());

    await new UpdateSponsorBannerUseCase(repository, makeAdmin(true)).handle({
      actorUserId: ActorId,
      bannerId: 'banner-1',
      displayOrder: 7,
    });

    expect(repository.update).toHaveBeenCalledWith({
      bannerId: 'banner-1',
      changes: { displayOrder: 7 },
    });
  });

  it('danh sách Admin chuyển lọc nguồn và chiến dịch xuống repository', async () => {
    const repository = makeRepository();
    repository.listForAdmin.mockResolvedValue({ items: [], total: 0 });

    await new ListAdminSponsorBannersUseCase(
      repository,
      makeAdmin(true),
    ).handle({
      actorUserId: ActorId,
      limit: 10,
      offset: 0,
      sourceType: 'CAMPAIGN',
      sourceId: 'campaign-1',
    });

    expect(repository.listForAdmin).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: 'CAMPAIGN',
        sourceId: 'campaign-1',
      }),
    );
  });
});

describe('DecideSponsorBannerApprovalUseCase (15/11)', () => {
  const decide = (
    repository: jest.Mocked<ISponsorBannerRepository>,
    command: Record<string, unknown>,
  ) =>
    new DecideSponsorBannerApprovalUseCase(repository, makeAdmin(true)).handle({
      actorUserId: ActorId,
      bannerId: 'banner-1',
      approve: true,
      ...command,
    } as never);

  it.each([undefined, '   '])(
    'từ chối mà lý do là %p -> 400, không ghi gì',
    async (note) => {
      const repository = makeRepository();

      await expect(
        decide(repository, { approve: false, note }),
      ).rejects.toThrow(ValidationFailedException);
      expect(repository.decideApproval).not.toHaveBeenCalled();
    },
  );

  it('duyệt không cần lý do; không gửi expectedUpdatedAt thì truyền null', async () => {
    const repository = makeRepository();
    repository.decideApproval.mockResolvedValue({
      kind: 'DECIDED',
      banner: banner(),
    });

    await decide(repository, {});

    expect(repository.decideApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        approve: true,
        note: null,
        expectedUpdatedAt: null,
      }),
    );
  });

  it('expectedUpdatedAt được chuyển thành Date', async () => {
    const repository = makeRepository();
    repository.decideApproval.mockResolvedValue({
      kind: 'DECIDED',
      banner: banner(),
    });

    await decide(repository, { expectedUpdatedAt: '2026-11-15T01:02:03.456Z' });

    expect(
      repository.decideApproval.mock.calls[0][0].expectedUpdatedAt?.toISOString(),
    ).toBe('2026-11-15T01:02:03.456Z');
  });

  it.each([
    ['CHANGED', SponsorBannerChangedSinceViewedException],
    ['ALREADY_DECIDED', SponsorBannerApprovalAlreadyDecidedException],
    ['NOT_FOUND', SponsorBannerNotFoundException],
  ] as const)('kết quả %s -> exception tương ứng', async (kind, exception) => {
    const repository = makeRepository();
    repository.decideApproval.mockResolvedValue({ kind } as never);

    await expect(decide(repository, {})).rejects.toThrow(exception);
  });
});

describe('ServeSponsorBannersUseCase', () => {
  it('bỏ số liệu và liên hệ đối tác khỏi bộ trường công khai', async () => {
    const repository = makeRepository();
    repository.findServing.mockResolvedValue([
      banner({ impressionCount: 999, clickCount: 42 }),
    ]);

    const result = await new ServeSponsorBannersUseCase(repository).handle({
      placement: 'HOME_HERO',
      limit: 5,
    });

    expect(Object.keys(result.banners[0]).sort()).toEqual([
      'displayOrder',
      'displayType',
      'endsAt',
      'globalId',
      'imageUrl',
      'partnerName',
      'placement',
      'sourceId',
      'sourceType',
      'startsAt',
      'targetUrl',
      'title',
    ]);
  });

  it('kẹp limit về trần, không để ?limit=10000 kéo cả bảng', async () => {
    const repository = makeRepository();

    await new ServeSponsorBannersUseCase(repository).handle({
      placement: 'HOME_HERO',
      limit: 10_000,
    });

    expect(repository.findServing).toHaveBeenCalledWith({
      placement: 'HOME_HERO',
      limit: 20,
    });
  });

  it('lỗi khi đếm lượt hiển thị KHÔNG làm hỏng lượt đọc', async () => {
    // Banner không hiện vì hụt một con số thống kê là đổi một sự cố nhỏ thành một khoảng
    // trống trên trang chủ.
    const repository = makeRepository();
    repository.findServing.mockResolvedValue([banner()]);
    repository.recordImpressions.mockRejectedValue(new Error('database sập'));

    const result = await new ServeSponsorBannersUseCase(repository).handle({
      placement: 'HOME_HERO',
      limit: 5,
    });

    expect(result.banners).toHaveLength(1);
  });

  it('không có banner nào thì không gọi recordImpressions', async () => {
    const repository = makeRepository();
    repository.findServing.mockResolvedValue([]);

    await new ServeSponsorBannersUseCase(repository).handle({
      placement: 'HOME_HERO',
      limit: 5,
    });

    expect(repository.recordImpressions).toHaveBeenCalledWith([]);
  });
});

describe('RecordBannerClickUseCase', () => {
  it('trả targetUrl từ server, không để client dùng bản đã cache', async () => {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(
      banner({ targetUrl: 'https://anlac.vn/link-moi' }),
    );
    repository.recordClick.mockResolvedValue(true);

    const result = await new RecordBannerClickUseCase(repository).handle({
      bannerId: 'banner-1',
    });

    expect(result.targetUrl).toBe('https://anlac.vn/link-moi');
  });

  it('banner hết hợp đồng thì NotServing — lỗi KHÔNG bị nuốt', async () => {
    // Khác lượt hiển thị: một lượt bấm là con số đối soát trực tiếp với đối tác, nên mất nó
    // là mất doanh thu đã phát sinh và người gọi phải biết.
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(banner());
    repository.recordClick.mockResolvedValue(false);

    await expect(
      new RecordBannerClickUseCase(repository).handle({ bannerId: 'banner-1' }),
    ).rejects.toThrow(SponsorBannerNotServingException);
  });

  it('banner không tồn tại thì NotFound', async () => {
    const repository = makeRepository();
    repository.findByGlobalId.mockResolvedValue(null);

    await expect(
      new RecordBannerClickUseCase(repository).handle({ bannerId: 'khong-co' }),
    ).rejects.toThrow(SponsorBannerNotFoundException);
    expect(repository.recordClick).not.toHaveBeenCalled();
  });
});
