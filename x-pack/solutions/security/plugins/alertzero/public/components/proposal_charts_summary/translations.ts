/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const RESPOND_LABEL = i18n.translate('xpack.alertzero.proposalStats.respondLabel', {
  defaultMessage: 'Respond',
});

export const INVESTIGATE_LABEL = i18n.translate('xpack.alertzero.proposalStats.investigateLabel', {
  defaultMessage: 'Investigate',
});

export const CONFIGURE_LABEL = i18n.translate('xpack.alertzero.proposalStats.configureLabel', {
  defaultMessage: 'Configure',
});

/** Takes the window rather than hardcoding 24h, which the chart no longer assumes. */
export const HOURS_AGO = (windowHours: number) =>
  i18n.translate('xpack.alertzero.proposalStats.hoursAgo', {
    defaultMessage: '{windowHours}h ago',
    values: { windowHours },
  });

export const NOW = i18n.translate('xpack.alertzero.proposalStats.now', {
  defaultMessage: 'Now',
});

export const CHART_ARIA_LABEL = (label: string, count: number, windowHours: number) =>
  i18n.translate('xpack.alertzero.proposalStats.chartAriaLabel', {
    defaultMessage: '{label}: {count} open proposals over the last {windowHours} hours',
    values: { label, count, windowHours },
  });

/**
 * The whole phrase, not `${label} + 'Actions'`: concatenating an English word
 * onto a translated label leaves half the string untranslated, and the literal
 * would sit outside `i18n.translate` where the i18n CI check cannot see it.
 */
export const CHART_SERIES_NAME = (label: string) =>
  i18n.translate('xpack.alertzero.proposalStats.chartSeriesName', {
    defaultMessage: '{label} actions',
    values: { label },
  });
