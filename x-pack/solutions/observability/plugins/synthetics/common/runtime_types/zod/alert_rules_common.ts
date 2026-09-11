/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod';

export const SyntheticsCommonStateCodec = z.looseObject({
  firstCheckedAt: z.string(),
  lastCheckedAt: z.string(),
  isTriggered: z.boolean(),
  firstTriggeredAt: z.string().optional(),
  lastTriggeredAt: z.string().optional(),
  lastResolvedAt: z.string().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
  idWithLocation: z.string().optional(),
});

export const SyntheticsMonitorStatusAlertStateCodec = z.looseObject({});
