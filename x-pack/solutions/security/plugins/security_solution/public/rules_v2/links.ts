/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import { ALERTS_UI_READ_PRIVILEGE } from '@kbn/security-solution-features/constants';
import { RULES_V2_PATH, SecurityPageName } from '../../common/constants';
import type { LinkItem } from '../common/links/types';

export const RULES_V2 = i18n.translate('xpack.securitySolution.navigation.rulesV2', {
  defaultMessage: 'Rules v2',
});

export const rulesV2Link: LinkItem = {
  capabilities: [[ALERTS_UI_READ_PRIVILEGE]],
  globalSearchKeywords: [
    i18n.translate('xpack.securitySolution.appLinks.rulesV2', {
      defaultMessage: 'Rules v2',
    }),
  ],
  id: SecurityPageName.rulesV2,
  path: RULES_V2_PATH,
  title: RULES_V2,
};
