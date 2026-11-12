import { z } from 'zod';

const str = z.string().nullish();

export const ImageIdsSchema = z
  .object({ list: str, cover: str, listclean: str, portrait: str })
  .nullish();

export const EpisodeSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  episodeNumber: z.number().nullish(),
  releaseDate: str,
  duration: z.number().nullish(),
  playedDuration: z.number().nullish(),
  webUrl: str,
  image: ImageIdsSchema,
  tvShow: z.object({ id: z.string(), title: z.string() }).nullish(),
});
export type Episode = z.infer<typeof EpisodeSchema>;

export const ShowSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: str,
  languages: z.array(z.string()).nullish(),
  webUrl: str,
  image: ImageIdsSchema,
  seasons: z.array(z.object({ id: z.string(), title: z.string() })).nullish(),
});
export type Show = z.infer<typeof ShowSchema>;

/** GraphQL answers carry errors next to data; a missing part is null. */
export function gqlSchema<Data extends z.ZodType>(data: Data) {
  return z.object({
    data: data.nullish(),
    errors: z.array(z.object({ message: z.string() })).nullish(),
  });
}

export const ShowAnswerSchema = gqlSchema(
  z.object({ tvShowRelatedContent: ShowSchema.nullish() }),
);

export const EpisodesAnswerSchema = gqlSchema(
  z.object({
    episodes: z
      .object({
        contents: z.array(z.unknown()),
        page: z.number(),
        size: z.number(),
        totalResults: z.number(),
      })
      .nullish(),
  }),
);

export const HistoryAnswerSchema = gqlSchema(
  z.object({
    watchHistory: z.object({ contents: z.array(z.unknown()) }).nullish(),
  }),
);

export const WatchlistAnswerSchema = gqlSchema(
  z.object({
    watchList: z
      .array(z.object({ id: z.string(), contents: z.array(z.unknown()) }))
      .nullish(),
  }),
);

export const ProfilesAnswerSchema = z.object({
  data: z.array(
    z
      .object({
        id: z.string(),
        name: z.string(),
        contentLanguages: z.array(z.string()).nullish(),
      })
      .passthrough(),
  ),
});
export type ZeeProfile = z.infer<typeof ProfilesAnswerSchema>['data'][number];

/** One item on a catalogue page, in either of the field spellings the pages use. */
export const RailItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: str,
  asset_subtype: str,
  assetSubType: str,
  languages: z.array(z.string()).nullish(),
  slug: str,
  web_url: str,
  webUrl: str,
  duration: z.number().nullish(),
  release_date: str,
  releaseDate: str,
  image: z.record(z.string(), z.string().nullish()).nullish(),
});
export type RailItem = z.infer<typeof RailItemSchema>;

export const TvLanguagePageSchema = z.object({
  props: z.object({
    pageProps: z.object({
      railsData: z.array(
        z.object({ title: z.string(), items: z.array(z.unknown()) }),
      ),
    }),
  }),
});

export const MovieLanguagePageSchema = z.object({
  props: z.object({
    pageProps: z.object({
      initialRails: z.array(
        z.object({ title: z.string(), contents: z.array(z.unknown()) }),
      ),
    }),
  }),
});
