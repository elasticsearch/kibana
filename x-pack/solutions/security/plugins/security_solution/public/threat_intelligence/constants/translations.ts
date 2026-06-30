/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const INDICATORS = i18n.translate(
  'xpack.securitySolution.threatIntelligence.navigation.indicatorsNavItemLabel',
  {
    defaultMessage: 'Indicators',
  }
);

export const INTELLIGENCE = i18n.translate(
  'xpack.securitySolution.threatIntelligence.navigation.intelligenceNavItemLabel',
  {
    defaultMessage: 'Intelligence',
  }
);

export const DESCRIPTION = i18n.translate(
  'xpack.securitySolution.threatIntelligence.navigation.indicatorsNavItemDescription',
  {
    defaultMessage:
      'Elastic threat intelligence helps you see if you are open to or have been subject to current or historical known threats.',
  }
);

export const INTELLIGENCE_HUB = i18n.translate(
  'xpack.securitySolution.threatIntelligence.navigation.intelligenceHubNavItemLabel',
  {
    defaultMessage: 'Intelligence Hub',
  }
);

export const INTELLIGENCE_HUB_DESCRIPTION = i18n.translate(
  'xpack.securitySolution.threatIntelligence.navigation.intelligenceHubNavItemDescription',
  {
    defaultMessage:
      'Cross-source threat intelligence dashboard with per-region, per-category, and environment-impact breakdowns.',
  }
);

export const CORRELATION_REPORT = i18n.translate(
  'xpack.securitySolution.threatIntelligence.navigation.correlationReportNavItemLabel',
  {
    defaultMessage: 'Correlation Report',
  }
);

export const CORRELATION_REPORT_DESCRIPTION = i18n.translate(
  'xpack.securitySolution.threatIntelligence.navigation.correlationReportNavItemDescription',
  {
    defaultMessage:
      'Correlate a threat report against the knowledge base and view structured findings.',
  }
);
