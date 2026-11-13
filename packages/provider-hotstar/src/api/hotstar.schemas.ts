import { z } from 'zod';

const str = z.string().nullish();

/** A navigation target: `page_slug` is the browser URL, `page_url` the BFF path. */
const NavigationSchema = z.object({
  page_type: str,
  page_url: str,
  page_slug: str,
});

export const ActionsSchema = z
  .object({
    on_click: z
      .array(
        z.object({
          page_navigation: NavigationSchema.nullish(),
          open_page_overlay: NavigationSchema.nullish(),
          fetch_widget: z.object({ url: z.string() }).nullish(),
        }),
      )
      .nullish(),
  })
  .nullish();
export type Actions = z.infer<typeof ActionsSchema>;

const ImageSchema = z.object({ src: z.string() }).nullish();

const TagsSchema = z.array(z.object({ value: str })).nullish();

const LanguageSelectorSchema = z
  .object({
    languages: z
      .array(z.object({ language: z.object({ iso2code: str }).nullish() }))
      .nullish(),
  })
  .nullish();

/** A show or film tile on a tray or grid. */
export const PosterSchema = z.object({
  content_id: z.string().min(1),
  image: ImageSchema,
  alt: z.object({ label: str }).nullish(),
  actions: ActionsSchema,
  expanded_content_poster: z
    .object({
      image: ImageSchema,
      content_info: z
        .object({
          title: str,
          description: str,
          tags: TagsSchema,
          title_cutout: ImageSchema,
          primary_cta: z.object({ actions: ActionsSchema }).nullish(),
        })
        .nullish(),
      content_language_selector: LanguageSelectorSchema,
    })
    .nullish(),
});
export type Poster = z.infer<typeof PosterSchema>;

export const WatchInfoSchema = z
  .object({
    content_id: str,
    parent_content_id: str,
    resume_at: str,
    duration: str,
    timestamp: str,
    watch_ratio: z.number().nullish(),
  })
  .nullish();

/** An episode in a show's episode tray. */
export const PlayableContentSchema = z.object({
  content_id: z.string().min(1),
  title: z.string().min(1),
  description: str,
  tags: TagsSchema,
  poster: ImageSchema,
  cw_info: WatchInfoSchema,
  actions: ActionsSchema,
});
export type PlayableContent = z.infer<typeof PlayableContentSchema>;

/** A tile on the Continue Watching grid. */
export const ContinueCardSchema = z.object({
  image: ImageSchema,
  actions: ActionsSchema,
  cw_info: WatchInfoSchema,
  footer: z.object({ title: str }).nullish(),
  alt: z.object({ label: str }).nullish(),
  meta_info: z
    .object({
      content_type: str,
      season_number: z.number().nullish(),
      episode_number: z.number().nullish(),
    })
    .nullish(),
});
export type ContinueCard = z.infer<typeof ContinueCardSchema>;

export const HeroSchema = z.object({
  hero_img: ImageSchema,
  content_info: z.object({
    title: z.string().min(1),
    description: str,
    content_id: str,
    title_cutout: ImageSchema,
    content_language_selector: LanguageSelectorSchema,
  }),
});

export const CategoryTraySchema = z.object({
  category_picker: z.object({
    data: z.object({
      tabs: z.array(
        z.object({
          tab: z.object({
            data: z.object({ title: z.string(), tray_widget_url: z.string() }),
          }),
        }),
      ),
    }),
  }),
  tray_items: z.object({
    data: z.object({ items: z.array(z.unknown()), next_tray_url: str }),
  }),
});

export const ProfilesSchema = z.object({
  profile_selection: z.object({
    data: z.object({
      profiles: z.array(
        z.object({
          id: z.string(),
          profile_name: z.string(),
          actions: z.object({ select_profile: ActionsSchema }).nullish(),
          select_profile: ActionsSchema,
        }),
      ),
    }),
  }),
});

/** Any widget: the template names what its `data` holds. */
export const WidgetWrapperSchema = z.object({
  template: z.string().nullish(),
  widget: z.object({ data: z.unknown().optional() }).nullish(),
});
export type WidgetWrapper = z.infer<typeof WidgetWrapperSchema>;

export const StartSchema = z.object({
  success: z.object({
    page: z.object({
      template: str,
      spaces: z.record(
        z.string(),
        z.object({
          widget_wrappers: z.array(WidgetWrapperSchema).nullish(),
          data: z.object({ next_space_url: str }).nullish(),
        }),
      ),
    }),
  }),
});
export type StartPage = z.infer<typeof StartSchema>['success']['page'];

export const SpaceSchema = z.object({
  success: z.object({
    space: z.object({
      widget_wrappers: z.array(WidgetWrapperSchema).nullish(),
      data: z.object({ next_space_url: str }).nullish(),
    }),
  }),
});

/** A further page of one tray or grid. */
export const ItemsPageSchema = z.object({
  success: z.object({
    widget_wrapper: z.object({
      template: str,
      widget: z.object({
        data: z.object({
          items: z.array(z.unknown()).nullish(),
          next_tray_url: str,
          more_grid_items_url: str,
        }),
      }),
    }),
  }),
});

export const TrayDataSchema = z.object({
  header: z
    .object({
      regular_tray_header: z.object({ title: str }).nullish(),
      title: str,
    })
    .nullish(),
  items: z.array(z.unknown()).nullish(),
  next_tray_url: str,
  more_grid_items_url: str,
});

/** A card in search results: the "MORE RESULTS" grid's, or the top match's hero. */
export const SearchCardSchema = z.object({
  title: z.string().min(1),
  /** "2026  •  Tamil  •  Star Vijay"; the hero has `content_info` instead. */
  sub_title: str,
  content_info: z.array(z.string()).nullish(),
  image: ImageSchema,
  actions: ActionsSchema,
  primary_cta: z.object({ actions: ActionsSchema }).nullish(),
});
export type SearchCard = z.infer<typeof SearchCardSchema>;
