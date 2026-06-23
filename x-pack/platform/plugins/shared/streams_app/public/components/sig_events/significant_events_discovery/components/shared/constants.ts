/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Detection, Discovery, SigEventStatus } from '@kbn/streams-schema';

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

export const SIG_EVENT_STATUS_COLORS: Record<SigEventStatus, string> = {
  promoted: 'danger',
  acknowledged: 'warning',
  resolved: 'success',
  demoted: 'default',
};
