/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export { getSavedSearchFullPathUrl } from './saved_searches_url';
export { extractTabs } from './service/extract_tabs';

export type {
  DiscoverGridSettings,
  DiscoverGridSettingsColumn,
  SavedSearch,
  SavedSearchAttributes,
  SavedSearchByValueAttributes,
  DiscoverSession,
  DiscoverSessionTab,
  DiscoverSessionTabTypeState,
} from './types';

export { VIEW_MODE } from '@kbn/discover-session-constants';

export {
  SavedSearchType,
  SavedSearchTypeDisplayName,
  LATEST_VERSION,
  MIN_SAVED_SEARCH_SAMPLE_SIZE,
  MAX_SAVED_SEARCH_SAMPLE_SIZE,
  MAX_DISCOVER_SESSION_COLUMNS,
  MAX_DISCOVER_SESSION_COLUMNS_SERVERLESS,
  MAX_DISCOVER_SESSION_TABS,
  MAX_METRICS_TAB_DIMENSIONS,
  MAX_METRICS_TAB_STATE_STRING_LENGTH,
} from '@kbn/discover-session-constants';

export {
  fromDiscoverSessionAttributesToSavedSearch,
  toSavedSearchAttributes,
} from './service/saved_searches_utils';
