/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { i18n } from '@kbn/i18n';

export const LINKS_EMBEDDABLE_TYPE = 'links';
export const LINKS_LIBRARY_TYPE = 'links';

export const LINKS_API_PATH = `/api/links`;
export const PUBLIC_API_VERSION = '2023-10-31';
export const APP_ICON = 'link';

export const APP_NAME = i18n.translate('links.visTypeAlias.title', {
  defaultMessage: 'Links',
});

export const DISPLAY_NAME = i18n.translate('links.displayName', {
  defaultMessage: 'links',
});

/**
 * Link types
 */
export const DASHBOARD_LINK_TYPE = 'dashboardLink';
export const EXTERNAL_LINK_TYPE = 'externalLink';

/**
 * Layout options
 */
export const LINKS_HORIZONTAL_LAYOUT = 'horizontal';
export const LINKS_VERTICAL_LAYOUT = 'vertical';

/**
 * Link options
 */
export const DEFAULT_EXTERNAL_LINK_OPTIONS = {
  encode_url: true,
  open_in_new_tab: true,
};
