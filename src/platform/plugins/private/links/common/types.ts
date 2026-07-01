/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  DASHBOARD_LINK_TYPE,
  EXTERNAL_LINK_TYPE,
  LINKS_HORIZONTAL_LAYOUT,
  LINKS_VERTICAL_LAYOUT,
} from './constants';

export type LinkType = typeof DASHBOARD_LINK_TYPE | typeof EXTERNAL_LINK_TYPE;
export type LinksLayoutType = typeof LINKS_HORIZONTAL_LAYOUT | typeof LINKS_VERTICAL_LAYOUT;
