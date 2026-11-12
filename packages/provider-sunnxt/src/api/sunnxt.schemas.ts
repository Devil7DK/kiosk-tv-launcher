import { z } from 'zod';

const nullableString = z.string().nullish();

export const ContentSchema = z.object({
  _id: z.string().min(1),
  title: nullableString,
  globalServiceId: nullableString,
  globalServiceName: nullableString,
  generalInfo: z.object({
    type: z.string(),
    title: nullableString,
    displayTitle: nullableString,
    briefDescription: nullableString,
    showDisplayTabs: z
      .object({
        showDisplayType: nullableString,
        showDisplayStart: nullableString,
        showDisplayEnd: nullableString,
      })
      .nullish(),
  }),
  content: z
    .object({
      serialNo: nullableString,
      seasonNo: nullableString,
      releaseDate: nullableString,
      duration: nullableString,
      language: z.array(z.string()).nullish(),
    })
    .nullish(),
  images: z
    .object({
      values: z.array(
        z.object({
          type: z.string(),
          profile: z.string(),
          resolution: z.string(),
          link: z.string(),
        }),
      ),
    })
    .nullish(),
});
export type Content = z.infer<typeof ContentSchema>;

/** Items are checked one by one, so one odd entry does not empty a whole row. */
export const ContentListSchema = z.object({
  results: z.array(z.unknown()).nullish(),
});

export const CarouselInfoSchema = z.object({
  results: z.array(
    z.object({
      name: z.string().min(1),
      title: nullableString,
      layoutType: nullableString,
    }),
  ),
});
export type CarouselRow = z.infer<typeof CarouselInfoSchema>['results'][number];

export const UserProfileSchema = z.object({
  result: z.object({
    profile: z.object({ _id: z.number(), first: nullableString }),
  }),
});

export const SubProfilesSchema = z.object({
  message: z.object({
    results: z.array(z.object({ id: z.number(), name: z.string() })),
  }),
});
