/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DashboardNavigationOptions } from '@kbn/dashboard-navigation-options-schema';
import type {
  DashboardLink,
  ExternalLink,
  ExternalLinkOptions,
  LinkOptions,
  LinksByValueState,
} from '../../../server';
import type { LinkType } from '../../types';
import { DASHBOARD_LINK_TYPE } from '../../constants';

export function getOptions(
  type: LinkType,
  options: LinkOptions
): LinksByValueState['links'][number]['options'] {
  if (type === DASHBOARD_LINK_TYPE) {
    const dashboardOptions = options as DashboardLink['options'] | undefined;
    return {
      ...(typeof dashboardOptions?.open_in_new_tab === 'boolean' && {
        open_in_new_tab: dashboardOptions.open_in_new_tab,
      }),
      // <9.4 stored as openInNewTab
      ...(typeof (dashboardOptions as { openInNewTab?: boolean })?.openInNewTab === 'boolean' && {
        open_in_new_tab: (dashboardOptions as { openInNewTab?: boolean }).openInNewTab,
      }),
      ...(typeof dashboardOptions?.use_filters === 'boolean' && {
        use_filters: dashboardOptions.use_filters,
      }),
      // <9.4 stored as useCurrentFilters
      ...(typeof (dashboardOptions as { useCurrentFilters?: boolean })?.useCurrentFilters ===
        'boolean' && {
        use_filters: (dashboardOptions as { useCurrentFilters?: boolean }).useCurrentFilters,
      }),
      ...(typeof dashboardOptions?.use_time_range === 'boolean' && {
        use_time_range: dashboardOptions.use_time_range,
      }),
      // <9.4 stored as useCurrentDateRange
      ...(typeof (dashboardOptions as { useCurrentDateRange?: boolean })?.useCurrentDateRange ===
        'boolean' && {
        use_time_range: (dashboardOptions as { useCurrentDateRange?: boolean }).useCurrentDateRange,
      }),
    } as DashboardNavigationOptions;
  }

  const urlOptions = options as ExternalLink['options'] | undefined;
  return {
    ...(typeof urlOptions?.open_in_new_tab === 'boolean' && {
      open_in_new_tab: urlOptions.open_in_new_tab,
    }),
    // <9.4 stored as openInNewTab
    ...(typeof (urlOptions as { openInNewTab?: boolean })?.openInNewTab === 'boolean' && {
      open_in_new_tab: (urlOptions as { openInNewTab?: boolean }).openInNewTab,
    }),
    ...(typeof urlOptions?.encode_url === 'boolean' && {
      encode_url: urlOptions.encode_url,
    }),
    // <9.4 stored as encodeUrl
    ...(typeof (urlOptions as { encodeUrl?: boolean })?.encodeUrl === 'boolean' && {
      encode_url: (urlOptions as { encodeUrl?: boolean }).encodeUrl,
    }),
  } as ExternalLinkOptions;
}
