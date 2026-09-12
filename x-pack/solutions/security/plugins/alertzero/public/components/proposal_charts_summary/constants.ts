/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import * as i18n from './translations';

/** `escalate` is omitted until there is a design decision on where it belongs. */
export const CHARTS_SUMMARY_PANELS = [
  { id: 'respond', category: 'contain', label: i18n.RESPOND_LABEL, color: 'danger' },
  { id: 'investigate', category: 'investigate', label: i18n.INVESTIGATE_LABEL, color: 'warning' },
  { id: 'configure', category: 'tune', label: i18n.CONFIGURE_LABEL, color: 'primary' },
] as const;

export type ChartsSummaryPanelId = (typeof CHARTS_SUMMARY_PANELS)[number]['id'];
export type ChartsSummaryPanelColor = (typeof CHARTS_SUMMARY_PANELS)[number]['color'];
