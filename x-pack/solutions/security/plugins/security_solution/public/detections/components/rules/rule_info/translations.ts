/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const UNKNOWN_TEXT = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleInfo.UnknownText',
  {
    defaultMessage: 'Unknown',
  }
);

export const RULE_VERSION_TOOLTIP_HEADER = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleInfo.versionToolTip.header',
  {
    defaultMessage: 'What is the Elastic version?',
  }
);

export const RULE_VERSION_TOOLTIP_CONTENT = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleInfo.versionToolTip.content',
  {
    defaultMessage:
      'The Elastic version indicates the latest update released by Elastic for this prebuilt rule',
  }
);

export const RULE_REVISION_TOOLTIP_HEADER = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleInfo.revisionToolTip.header',
  {
    defaultMessage: 'What is a revision?',
  }
);

export const RULE_REVISION_TOOLTIP_CONTENT = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleInfo.revisionToolTip.content',
  {
    defaultMessage:
      'Changes to the rule are tracked as revisions. The revision number increments each time you save your changes.',
  }
);
