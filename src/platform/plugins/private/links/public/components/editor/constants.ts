/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { DASHBOARD_LINK_TYPE, EXTERNAL_LINK_TYPE } from '../../../common/constants';
import type { LinkType } from '../../../common/types';
import { DashboardLinkStrings } from '../dashboard_link/dashboard_link_strings';
import { ExternalLinkStrings } from '../external_link/external_link_strings';

export const LinkInfo: {
  [id in LinkType]: {
    icon: string;
    type: string;
    displayName: string;
    description: string;
  };
} = {
  [DASHBOARD_LINK_TYPE]: {
    icon: 'dashboardApp',
    type: DashboardLinkStrings.getType(),
    displayName: DashboardLinkStrings.getDisplayName(),
    description: DashboardLinkStrings.getDescription(),
  },
  [EXTERNAL_LINK_TYPE]: {
    icon: 'link',
    type: ExternalLinkStrings.getType(),
    displayName: ExternalLinkStrings.getDisplayName(),
    description: ExternalLinkStrings.getDescription(),
  },
};
