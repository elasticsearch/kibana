/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const AI_VALUE_DASHBOARD = i18n.translate(
  'xpack.securitySolutionServerless.upselling.aiValueReport.pageTitle',
  {
    defaultMessage: 'Value report',
  }
);

export const UPGRADE_TITLE = (requiredProduct: string) =>
  i18n.translate('xpack.securitySolutionServerless.upselling.aiValueReport.upgradeTitle', {
    defaultMessage: 'Value Report is available on the {requiredProduct} plan',
    values: { requiredProduct },
  });

export const UPGRADE_TEXT = (requiredProduct: string) =>
  i18n.translate('xpack.securitySolutionServerless.upselling.aiValueReport.upgradeText', {
    defaultMessage:
      'See how Elastic AI SOC saves your team time and money through AI triage, including estimated analyst hours reclaimed, reduced costs, and real threats surfaced faster. Available on the {requiredProduct} plan.',
    values: { requiredProduct },
  });

export const UPGRADE_CTA = i18n.translate(
  'xpack.securitySolutionServerless.upselling.aiValueReport.upgradeCta',
  {
    defaultMessage: 'Upgrade plan',
  }
);
