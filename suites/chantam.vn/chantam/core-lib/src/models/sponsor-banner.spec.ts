import * as banner from './sponsor-banner';
import {
  BannerPlacements,
  MaxBannerPartnerNameLength,
  MaxBannerTitleLength,
  bannerClickThroughRate,
  bannerGaps,
  isBannerImageUrl,
  isBannerTargetUrl,
  isBannerWithinWindow,
} from './sponsor-banner';

const Hour = 3_600_000;

function validInput(overrides: Record<string, unknown> = {}) {
  const startsAt = new Date('2026-08-01T00:00:00.000Z');
  return {
    partnerName: 'Công ty TNHH An Lạc',
    title: 'Mùa Vu Lan An Lạc',
    placement: 'HOME_HERO',
    imageUrl: 'https://cdn.chantam.vn/banners/vu-lan.jpg',
    targetUrl: 'https://anlac.vn/vu-lan',
    startsAt,
    endsAt: new Date(startsAt.getTime() + 30 * 24 * Hour),
    ...overrides,
  } as Parameters<typeof bannerGaps>[0];
}

describe('isBannerImageUrl', () => {
  it('chỉ nhận https', () => {
    expect(isBannerImageUrl('https://cdn.chantam.vn/a.jpg')).toBe(true);
    expect(isBannerImageUrl('http://cdn.chantam.vn/a.jpg')).toBe(false);
    expect(isBannerImageUrl('chantam://home')).toBe(false);
    expect(isBannerImageUrl(null)).toBe(false);
  });
});

describe('isBannerTargetUrl', () => {
  it('nhận https và deep link của app', () => {
    expect(isBannerTargetUrl('https://anlac.vn/vu-lan')).toBe(true);
    expect(isBannerTargetUrl('chantam://campaigns/vu-lan')).toBe(true);
    // Cả hai tên lược đồ cho tới khi mobile chốt một (CMS B7).
    expect(isBannerTargetUrl('givingapp://campaigns/vu-lan')).toBe(true);
  });

  it('từ chối javascript: và http:', () => {
    expect(isBannerTargetUrl('javascript:alert(1)')).toBe(false);
    expect(isBannerTargetUrl('http://anlac.vn')).toBe(false);
    expect(isBannerTargetUrl('data:text/html,<script>')).toBe(false);
  });

  it('từ chối javascript: có chứa chuỗi https:// ở giữa', () => {
    // So khớp ĐẦU chuỗi, không `includes`. Dùng `includes` thì payload dưới đây đi qua —
    // và chỉ cần một WebView cấu hình lỏng là nó chạy.
    expect(isBannerTargetUrl("javascript:fetch('https://evil.vn')")).toBe(
      false,
    );
  });

  it('từ chối url quá dài', () => {
    expect(isBannerTargetUrl(`https://a.vn/${'x'.repeat(3_000)}`)).toBe(false);
  });
});

describe('bannerClickThroughRate', () => {
  it('giữ hai chữ số thập phân', () => {
    // CTR banner thường dưới 1%. Làm tròn về phần trăm nguyên biến mọi banner thành "0%",
    // và Admin mất hẳn cách so banner nào hiệu quả hơn.
    expect(
      bannerClickThroughRate({ impressionCount: 10_000, clickCount: 37 }),
    ).toBe(0.37);
  });

  it('chưa có lượt hiển thị ra null, KHÔNG ra 0', () => {
    // `0` đọc ra "không ai bấm", trong khi sự thật là chưa ai thấy.
    expect(
      bannerClickThroughRate({ impressionCount: 0, clickCount: 0 }),
    ).toBeNull();
  });

  it('1/21 ra 4.76', () => {
    expect(bannerClickThroughRate({ impressionCount: 21, clickCount: 1 })).toBe(
      4.76,
    );
  });
});

describe('isBannerWithinWindow', () => {
  const startsAt = new Date('2026-08-01T00:00:00.000Z');
  const endsAt = new Date('2026-09-01T00:00:00.000Z');

  it('trong khung thì true', () => {
    expect(
      isBannerWithinWindow({
        startsAt,
        endsAt,
        now: new Date('2026-08-15T00:00:00.000Z'),
      }),
    ).toBe(true);
  });

  it('ĐÚNG giây bắt đầu thì đã chạy', () => {
    expect(isBannerWithinWindow({ startsAt, endsAt, now: startsAt })).toBe(
      true,
    );
  });

  it('ĐÚNG giây kết thúc thì đã dừng — nửa mở [starts, ends)', () => {
    // Cùng quy ước với `EXCLUDE ... tstzrange(..., '[)')`, để hai banner xếp liền nhau
    // không chồng nhau một tích tắc.
    expect(isBannerWithinWindow({ startsAt, endsAt, now: endsAt })).toBe(false);
  });

  it('chưa tới giờ thì false', () => {
    expect(
      isBannerWithinWindow({
        startsAt,
        endsAt,
        now: new Date('2026-07-31T23:59:59.000Z'),
      }),
    ).toBe(false);
  });
});

describe('bannerGaps', () => {
  it('banner đủ thông tin không có khoảng trống', () => {
    expect(bannerGaps(validInput())).toEqual([]);
  });

  it('vị trí ngoài allowlist bị bắt, và nói rõ những giá trị hợp lệ', () => {
    const gaps = bannerGaps(validInput({ placement: 'trang-chu' }));
    expect(gaps).toHaveLength(1);
    for (const placement of BannerPlacements)
      expect(gaps[0]).toContain(placement);
  });

  it('targetUrl javascript: bị bắt', () => {
    expect(
      bannerGaps(validInput({ targetUrl: 'javascript:alert(1)' })),
    ).toEqual([expect.stringContaining('targetUrl')]);
  });

  it('imageUrl http bị bắt', () => {
    expect(
      bannerGaps(validInput({ imageUrl: 'http://cdn.chantam.vn/a.jpg' })),
    ).toContain('imageUrl phải là một đường dẫn https');
  });

  it('partnerName rỗng bị bắt — không biết banner của ai thì không đối soát được', () => {
    expect(bannerGaps(validInput({ partnerName: '   ' }))[0]).toContain(
      'partnerName',
    );
  });

  it('tên quá dài bị bắt', () => {
    expect(
      bannerGaps(
        validInput({ partnerName: 'a'.repeat(MaxBannerPartnerNameLength + 1) }),
      ),
    ).toContainEqual(expect.stringContaining('partnerName'));
    expect(
      bannerGaps(validInput({ title: 'a'.repeat(MaxBannerTitleLength + 1) })),
    ).toContainEqual(expect.stringContaining('title'));
  });

  it('endsAt không sau startsAt bị bắt', () => {
    const startsAt = new Date('2026-08-01T00:00:00.000Z');
    expect(bannerGaps(validInput({ startsAt, endsAt: startsAt }))).toContain(
      'endsAt phải sau startsAt',
    );
  });

  it('mốc thời gian hỏng không làm hàm ném', () => {
    // `new Date('khong-phai-ngay')` ra `Invalid Date` và `.getTime()` ra `NaN`. So sánh
    // thẳng thì `NaN <= NaN` là `false` và một mốc rác ĐI QUA được.
    expect(
      bannerGaps(validInput({ startsAt: new Date('khong-phai-ngay') })),
    ).toContain('startsAt không phải thời điểm hợp lệ');
  });
});

describe('đề xuất chiến dịch lên trang chủ (15/11)', () => {
  it('APP_SPLASH là một vị trí hợp lệ, có nhãn', () => {
    expect(banner.BannerPlacements).toContain('APP_SPLASH');
    expect(banner.BannerPlacementLabels.APP_SPLASH).toBe('Poster sau màn chờ');
  });

  it.each([
    ['APP_SPLASH', 'FULLSCREEN', true],
    ['APP_SPLASH', 'BANNER', false],
    ['HOME_HERO', 'FULLSCREEN', false],
    ['HOME_HERO', 'SLIDER', true],
    ['DHARMA_HOME', 'FLOATING', true],
    ['HOME_INLINE', 'POPUP', false],
  ] as const)('cặp %s + %s hợp lệ = %s', (placement, displayType, ok) => {
    expect(
      banner.bannerDisplayTypeGaps(placement, displayType).length === 0,
    ).toBe(ok);
  });

  it('kiểu mặc định theo vị trí', () => {
    expect(banner.defaultBannerDisplayType('HOME_HERO')).toBe('SLIDER');
    expect(banner.defaultBannerDisplayType('APP_SPLASH')).toBe('FULLSCREEN');
    expect(banner.defaultBannerDisplayType('POST_LIST')).toBe('BANNER');
  });

  it.each([
    [5, 5],
    [1, 1],
    [20, 20],
    [0, 3],
    [21, 3],
    [2.5, 3],
    ['4', 3],
    [null, 3],
  ])('mốc đề xuất %p → %p', (value, expected) => {
    expect(banner.normalizeCampaignPromotionMaxOpen(value)).toBe(expected);
  });

  it('link do server dựng trỏ về chiến dịch và là một target hợp lệ', () => {
    const url = banner.campaignPromotionTargetUrl('abc');
    expect(url).toBe('chantam://campaign/abc');
    expect(isBannerTargetUrl(url)).toBe(true);
  });

  it('trạng thái hiển thị suy theo đúng thứ tự ưu tiên', () => {
    const now = new Date('2026-11-15T00:00:00.000Z');
    const base = {
      approvalStatus: 'APPROVED' as const,
      isActive: true,
      startsAt: new Date(now.getTime() - Hour),
      endsAt: new Date(now.getTime() + Hour),
      now,
    };
    const state = banner.campaignPromotionServingState;
    expect(state({ ...base, approvalStatus: 'PENDING_APPROVAL' })).toBe(
      'PENDING',
    );
    expect(state({ ...base, approvalStatus: 'REJECTED' })).toBe('REJECTED');
    expect(state({ ...base, isActive: false })).toBe('INACTIVE');
    expect(state({ ...base, endsAt: now })).toBe('EXPIRED');
    expect(
      state({
        ...base,
        startsAt: new Date(now.getTime() + Hour),
        endsAt: new Date(now.getTime() + 2 * Hour),
      }),
    ).toBe('SCHEDULED');
    expect(state(base)).toBe('RUNNING');
  });
});
