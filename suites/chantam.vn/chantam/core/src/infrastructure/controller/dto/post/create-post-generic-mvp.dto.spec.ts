import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePostBodyDto } from './create-post.dto';

const common = {
  title: 'Bài đăng canonical dùng chung',
  description: 'Mô tả đủ dài cho Generic MVP của mọi loại bài đăng.',
  categoryId: '30000000-0000-4000-8000-000000000001',
  location: { lat: 10.7724, lng: 106.698 },
  areaLabel: 'Quận 1, TP.HCM',
};

describe('CreatePostBodyDto Generic MVP', () => {
  it.each(['OFFER', 'WANTED', 'CHARITY', 'CLASSIFIED', 'MERIT'])(
    'accepts Generic MVP post type %s',
    async (postType) => {
      const errors = await validate(
        plainToInstance(CreatePostBodyDto, {
          post: {
            ...common,
            postType,
            ...(postType === 'OFFER'
              ? { condition: 'USED', estimatedValue: 1_500_000 }
              : {}),
            // Tin rao vặt bắt buộc có giá và tình trạng món đồ.
            ...(postType === 'CLASSIFIED'
              ? { price: 5_200_000, condition: 'USED' }
              : {}),
          },
        }),
      );

      expect(errors).toHaveLength(0);
    },
  );
});

describe('CreatePostBodyDto · phí ship và availableDay (16/11)', () => {
  const validateWanted = (extra: Record<string, unknown>) =>
    validate(
      plainToInstance(CreatePostBodyDto, {
        post: { ...common, postType: 'WANTED', ...extra },
      }),
    );

  it.each([{ availableDay: 1 }, { availableDay: 30 }, { shippingFee: 0 }])(
    'nhận %p',
    async (extra) => {
      expect(
        await validateWanted({ ...extra, deliveryMethod: 'GIVER_SHIPS' }),
      ).toHaveLength(0);
    },
  );

  it.each([
    { availableDay: 0 },
    { availableDay: 31 },
    { availableDay: 2.5 },
    { shippingFee: -1 },
    { shippingFee: 10_000_001 },
  ])('từ chối %p', async (extra) => {
    expect(await validateWanted(extra)).not.toHaveLength(0);
  });
});
