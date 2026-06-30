/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Detection, Discovery, SignificantEventStatus } from '@kbn/significant-events-schema';

export const DETECTION_KIND_COLORS: Record<Detection['kind'], string> = {
  detection: 'warning',
  quiet: 'success',
  handled: 'primary',
};

export const DISCOVERY_KIND_COLORS: Record<Discovery['kind'], string> = {
  discovery: 'warning',
  clearance: 'success',
  handled: 'primary',
};

export const SIGNIFICANT_EVENT_STATUS_COLORS: Record<SignificantEventStatus, string> = {
  promoted: 'danger',
  acknowledged: 'warning',
  resolved: 'success',
  demoted: 'default',
};
