/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { i18n } from '@kbn/i18n';
import {
  ACCESSIBILITY_CATEGORY,
  ALERTING_V2_CATEGORY,
  AUTOCOMPLETE_CATEGORY,
  BANNER_CATEGORY,
  DEV_TOOLS_CATEGORY,
  DISCOVER_CATEGORY,
  ENTERPRISE_SEARCH_CATEGORY,
  GENERAL_CATEGORY,
  MACHINE_LEARNING_CATEGORY,
  NOTIFICATIONS_CATEGORY,
  OBSERVABILITY_CATEGORY,
  PRESENTATION_LAB_CATEGORY,
  REPORTING_CATEGORY,
  ROLLUPS_CATEGORY,
  SEARCH_CATEGORY,
  SECURITY_SOLUTION_CATEGORY,
  TIMELION_CATEGORY,
  VISUALIZATION_CATEGORY,
} from './const';

const upperFirst = (str = '') => str.replace(/^./, (strng) => strng.toUpperCase());

const names: Record<string, string> = {
  [GENERAL_CATEGORY]: i18n.translate('management.settings.categoryNames.generalLabel', {
    defaultMessage: 'General',
  }),
  [MACHINE_LEARNING_CATEGORY]: i18n.translate(
    'management.settings.categoryNames.machineLearningLabel',
    {
      defaultMessage: 'Machine Learning',
    }
  ),
  [OBSERVABILITY_CATEGORY]: i18n.translate('management.settings.categoryNames.observabilityLabel', {
    defaultMessage: 'Observability',
  }),
  [TIMELION_CATEGORY]: i18n.translate('management.settings.categoryNames.timelionLabel', {
    defaultMessage: 'Timelion',
  }),
  [NOTIFICATIONS_CATEGORY]: i18n.translate('management.settings.categoryNames.notificationsLabel', {
    defaultMessage: 'Notifications',
  }),
  [VISUALIZATION_CATEGORY]: i18n.translate(
    'management.settings.categoryNames.visualizationsLabel',
    {
      defaultMessage: 'Visualization',
    }
  ),
  [DISCOVER_CATEGORY]: i18n.translate('management.settings.categoryNames.discoverLabel', {
    defaultMessage: 'Discover',
  }),
  [REPORTING_CATEGORY]: i18n.translate('management.settings.categoryNames.reportingLabel', {
    defaultMessage: 'Reporting',
  }),
  [SEARCH_CATEGORY]: i18n.translate('management.settings.categoryNames.searchLabel', {
    defaultMessage: 'Elasticsearch',
  }),
  [SECURITY_SOLUTION_CATEGORY]: i18n.translate(
    'management.settings.categoryNames.securitySolutionLabel',
    {
      defaultMessage: 'Security Solution',
    }
  ),
  [ENTERPRISE_SEARCH_CATEGORY]: i18n.translate(
    'management.settings.categoryNames.enterpriseSearchLabel',
    {
      defaultMessage: 'Enterprise Search',
    }
  ),
  [PRESENTATION_LAB_CATEGORY]: i18n.translate(
    'management.settings.categoryNames.presentationLabLabel',
    {
      defaultMessage: 'Presentation Labs',
    }
  ),
  [ACCESSIBILITY_CATEGORY]: i18n.translate('management.settings.categoryNames.accessibilityLabel', {
    defaultMessage: 'Accessibility',
  }),
  [AUTOCOMPLETE_CATEGORY]: i18n.translate('management.settings.categoryNames.autocompleteLabel', {
    defaultMessage: 'Autocomplete',
  }),
  [BANNER_CATEGORY]: i18n.translate('management.settings.categoryNames.bannerLabel', {
    defaultMessage: 'Banner',
  }),
  [ROLLUPS_CATEGORY]: i18n.translate('management.settings.categoryNames.rollupsLabel', {
    defaultMessage: 'Rollups',
  }),
  [DEV_TOOLS_CATEGORY]: i18n.translate('management.settings.categoryNames.devToolsLabel', {
    defaultMessage: 'Developer Tools',
  }),
  [ALERTING_V2_CATEGORY]: i18n.translate('management.settings.categoryNames.alertingV2Label', {
    defaultMessage: 'Alerting V2',
  }),
};

export function getCategoryName(category?: string) {
  return category ? names[category] || upperFirst(category) : '';
}
