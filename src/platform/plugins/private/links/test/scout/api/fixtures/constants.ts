/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { PUBLIC_API_VERSION } from '../../../../common/constants';

/** The base API path for links endpoints (no leading slash for apiClient). */
export const LINKS_API_PATH = 'api/links';

/** Common headers for Links API requests */
export const COMMON_HEADERS = {
  'kbn-xsrf': 'some-xsrf-token',
  'x-elastic-internal-origin': 'kibana',
  'elastic-api-version': PUBLIC_API_VERSION,
} as const;

/** Minimal valid external link object */
export const EXTERNAL_LINK = {
  type: 'externalLink' as const,
  destination: 'https://example.com',
  options: {
    encode_url: true,
    open_in_new_tab: true,
  },
};

/** Minimal valid dashboard link object — uses a placeholder destination ID */
export const DASHBOARD_LINK = {
  type: 'dashboardLink' as const,
  destination: 'test-dashboard-id',
  options: {
    use_filters: false,
    use_time_range: false,
    open_in_new_tab: false,
  },
};

/** Minimal valid request body for creating a links library item */
export const MINIMAL_LINKS_BODY = {
  title: 'Test Links Panel',
  links: [EXTERNAL_LINK],
} as const;
