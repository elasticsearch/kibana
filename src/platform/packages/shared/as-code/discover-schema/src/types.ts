/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { z } from '@kbn/zod';
import type {
  discoverSessionApiDataSchema,
  discoverSessionClassicTabSchema,
  discoverSessionDefaultTabTypeStateSchema,
  discoverSessionEsqlTabSchema,
  discoverSessionMetricsTabSchema,
  discoverSessionApiTabSchema,
} from './schemas/session_data';
import type { discoverSessionMetricsTabTypeStateSchema } from './schemas/metrics_tab';

// Output types (after parsing — all defaults resolved)
export type DiscoverSessionData = z.output<typeof discoverSessionApiDataSchema>;
export type DiscoverSessionApiClassicTab = z.output<typeof discoverSessionClassicTabSchema>;
export type DiscoverSessionApiMetricsTab = z.output<typeof discoverSessionMetricsTabSchema>;
export type DiscoverSessionApiEsqlTab =
  | z.output<typeof discoverSessionEsqlTabSchema>
  | DiscoverSessionApiMetricsTab;
export type DiscoverSessionApiTab = z.output<typeof discoverSessionApiTabSchema>;
export type DiscoverSessionApiTabTypeState =
  | z.output<typeof discoverSessionDefaultTabTypeStateSchema>
  | z.output<typeof discoverSessionMetricsTabTypeStateSchema>;

// Input types (before parsing — fields with defaults are optional)
export type DiscoverSessionApiInput = z.input<typeof discoverSessionApiDataSchema>;
