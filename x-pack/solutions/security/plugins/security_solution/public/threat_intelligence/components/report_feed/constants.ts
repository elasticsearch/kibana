/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SeverityLevel } from '../../../../common/threat_intelligence/hub';

export type ReportFeedSort = 'relevance' | 'date' | 'severity';

export const SEVERITY_BADGE_COLOR: Record<
  SeverityLevel,
  'success' | 'warning' | 'danger' | 'default' | 'hollow'
> = {
  low: 'hollow',
  medium: 'warning',
  high: 'danger',
  critical: 'danger',
};

/** Hex accents for severity bars, chips, and chart shading. */
export const SEVERITY_HEX: Record<SeverityLevel, string> = {
  low: '#54B399',
  medium: '#D6BF57',
  high: '#DA8B45',
  critical: '#BD271E',
};

export const SEVERITY_RANK: Record<SeverityLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};
