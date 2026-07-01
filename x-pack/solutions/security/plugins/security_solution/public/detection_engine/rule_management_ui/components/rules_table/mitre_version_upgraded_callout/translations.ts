/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const MITRE_VERSION_UPGRADED_CALLOUT_TITLE = (version: string) =>
  i18n.translate('xpack.securitySolution.rulesManagement.mitreVersionUpgradedCallout.title', {
    values: { version },
    defaultMessage: 'MITRE ATT&CK\u00AE updated to {version}',
  });

export const MITRE_VERSION_UPGRADED_CALLOUT_LEARN_MORE = i18n.translate(
  'xpack.securitySolution.rulesManagement.mitreVersionUpgradedCallout.learnMore',
  {
    defaultMessage: 'Learn more',
  }
);
