/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import { ALERTS_UI_READ_PRIVILEGE } from '@kbn/security-solution-features/constants';
import { ALERTS_V2_PATH, SecurityPageName } from '../../common/constants';
import type { LinkItem } from '../common/links/types';

export const ALERTS_V2 = i18n.translate('xpack.securitySolution.navigation.alertsV2', {
  defaultMessage: 'Alerts v2',
});

export const alertsV2Link: LinkItem = {
  capabilities: [[ALERTS_UI_READ_PRIVILEGE]],
  globalSearchKeywords: [
    i18n.translate('xpack.securitySolution.appLinks.alertsV2', {
      defaultMessage: 'Alerts v2',
    }),
  ],
  id: SecurityPageName.alertsV2,
  path: ALERTS_V2_PATH,
  title: ALERTS_V2,
};
