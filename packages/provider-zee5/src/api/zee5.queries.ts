/** Only the fields used here; the GraphQL route accepts any query its schema allows. */

export const SHOW_QUERY = `
query ($id: ID!, $country: String, $translation: String) {
  tvShowRelatedContent(id: $id, country: $country, translation: $translation) {
    id title description languages webUrl image { list cover }
    seasons { id title }
  }
}`;

const EPISODE_FIELDS =
  'id title episodeNumber releaseDate duration playedDuration webUrl image { list } tvShow { id title }';

export const EPISODES_QUERY = `
query ($filter: EpisodeFilter) {
  episodes(filter: $filter) {
    contents { ... on Episode { ${EPISODE_FIELDS} } }
    page size totalResults
  }
}`;

export const HISTORY_QUERY = `
query ($country: String, $translation: String) {
  watchHistory(country: $country, translation: $translation) {
    contents {
      ... on Episode { ${EPISODE_FIELDS} }
      ... on Movie { id title releaseDate duration playedDuration webUrl image { list } }
    }
  }
}`;

export const WATCHLIST_QUERY = `
query ($country: String, $translation: String) {
  watchList(country: $country, translation: $translation) {
    id
    contents { ... on TVShow { id title description languages webUrl image { list cover } } }
  }
}`;
