/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type { AppHeaderBadge } from '@kbn/app-header';

/**
 * Shared "Experimental" badge for alerting v2 page headers. Replaces the
 * EuiBetaBadge previously rendered by ExperimentalBadge inline next to each
 * page title. Sits in AppHeader's `badges` slot.
 */
export const EXPERIMENTAL_APP_HEADER_BADGE: AppHeaderBadge = {
  label: i18n.translate('xpack.alertingV2.appHeader.experimentalBadge.label', {
    defaultMessage: 'Experimental',
  }),
  color: 'hollow',
  tooltip: i18n.translate('xpack.alertingV2.appHeader.experimentalBadge.tooltip', {
    defaultMessage:
      'This functionality is experimental and may be changed or removed completely in a future release. Elastic will work to fix any issues, but experimental features are not subject to the support SLA of official GA features.',
  }),
  'data-test-subj': 'alertingV2ExperimentalBadge',
};

export const APP_HEADER_BACK_LABEL = i18n.translate('xpack.alertingV2.appHeader.backLabel', {
  defaultMessage: 'Back',
});
