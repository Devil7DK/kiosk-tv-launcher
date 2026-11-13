import {
  fetchJson,
  fetchText,
  type PageFetchInit,
} from '@kiosk-tv/provider-kit';
import type { Page } from 'playwright-core';
import type { z } from 'zod';

import {
  CarouselInfoSchema,
  ContentListSchema,
  SubProfilesSchema,
  UserProfileSchema,
} from './sunnxt.schemas.js';

export const SITE = 'https://www.sunnxt.com';
const API = 'https://pwaapi.sunnxt.com';
const FIELDS =
  'fields=contents,user/currentdata,images,generalInfo,relatedCast,globalServiceName,globalServiceId,publishingHouse';

/** Sun NXT's API calls a language by name. */
const LANGUAGE_NAMES: Record<string, string> = {
  ta: 'tamil',
  te: 'telugu',
  ml: 'malayalam',
  kn: 'kannada',
  hi: 'hindi',
  en: 'english',
  bn: 'bengali',
  mr: 'marathi',
};

export function languageName(code: string): string {
  return LANGUAGE_NAMES[code] ?? code;
}

export function languageCode(name: string): string | undefined {
  return Object.entries(LANGUAGE_NAMES).find(([, n]) => n === name)?.[0];
}

/** Format of `betweenDates`: year, then day, then month. */
export function betweenDates(year: number, month: number): string {
  const mm = String(month).padStart(2, '0');
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}01${mm}T000000-${year}${String(last).padStart(2, '0')}${mm}T235900`;
}

export class SunNxtApi {
  constructor(
    private readonly page: () => Promise<Page>,
    private readonly language: () => string,
  ) {}

  private async get<Schema extends z.ZodType>(
    url: string,
    schema: Schema,
    init: PageFetchInit = {},
  ): Promise<z.infer<Schema>> {
    return fetchJson(await this.page(), url, schema, {
      ...init,
      headers: { ...this.headers(), ...init.headers },
    });
  }

  /** Without these the API answers 500 "log in again". */
  private headers(): Record<string, string> {
    return {
      'x-myplex-platform': 'browser',
      'x-ucv': '7',
      contentlanguage: this.language(),
    };
  }

  currentProfile() {
    return this.get(`${SITE}/next/api/userProfile`, UserProfileSchema);
  }

  profiles() {
    return this.get(`${API}//user/v4/subProfiles`, SubProfilesSchema);
  }

  async switchProfile(id: number, name: string): Promise<void> {
    await fetchText(await this.page(), `${API}/user/v4/switchProfile/`, {
      method: 'POST',
      headers: {
        ...this.headers(),
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: `userId=${id}&username=${encodeURIComponent(name)}`,
    });
  }

  contentDetail(id: string) {
    return this.get(
      `${API}/content/v3/contentDetail/${encodeURIComponent(id)}/?level=devicemax&${FIELDS}`,
      ContentListSchema,
    );
  }

  episodes(showId: string, year: number, month: number) {
    return this.get(
      `${API}/content/v3/vods/GID_${encodeURIComponent(showId)}/?orderBy=releaseDate&orderMode=-1&startIndex=1&count=60&betweenDates=${betweenDates(year, month)}&${FIELDS}`,
      ContentListSchema,
    );
  }

  carouselRows(group: string) {
    return this.get(
      `${API}/content/v2/carousel/_info?group=${group}&language=${this.language()}`,
      CarouselInfoSchema,
    );
  }

  /** `page` counts from 1; Sun NXT calls it `startIndex`. */
  carousel(name: string, page: number, count: number) {
    return this.get(
      `${API}/content/v2/carousel/${encodeURIComponent(name)}?&level=devicemax&startIndex=${page}&count=${count}&contentlang=${this.language()}`,
      ContentListSchema,
    );
  }

  /**
   * One kind of result, as the search page asks for each: `type` is
   * "tvSeries,vodChannel,vod" for shows and their episodes, "movie" for films.
   * Without `type`, `searchFields` and `publishingHouseId` the answer is unrelated.
   */
  search(query: string, type: string) {
    return this.get(
      `${API}/content/v3/search/?${FIELDS}&level=dynamic&query=${encodeURIComponent(query)}&startIndex=1&count=10&type=${type}&searchFields=title&publishingHouseId=45&languageFilters=`,
      ContentListSchema,
    );
  }

  favourites() {
    return this.get(
      `${API}/user/v2/contentList/favorites/?level=devicemin&count=100`,
      ContentListSchema,
    );
  }
}
