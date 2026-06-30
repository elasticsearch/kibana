/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SeverityLevel } from '../../../../common/threat_intelligence/hub';
import { SEVERITY_HEX } from './constants';

/** Title-case severity labels (CISO `SEVERITY_CONFIG`). */
export const SEVERITY_LABELS: Record<SeverityLevel, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

export const getSeverityLabel = (severity: SeverityLevel): string => SEVERITY_LABELS[severity];

export const getSeverityColor = (severity: SeverityLevel): string => SEVERITY_HEX[severity];
