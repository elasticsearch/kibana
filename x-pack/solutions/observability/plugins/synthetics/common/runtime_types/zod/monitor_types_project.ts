/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod';
import { AlertConfigsCodec } from './alert_config';
import { ScreenshotOptionCodec } from './monitor_configs';

const ProjectMonitorSchedule = z.union([z.number(), z.literal('10s'), z.literal('30s')]);

export const ProjectMonitorThrottlingConfigCodec = z.union([
  z.looseObject({
    download: z.number(),
    upload: z.number(),
    latency: z.number(),
  }),
  z.boolean(),
]);

export const ProjectMonitorCodec = z.looseObject({
  type: z.string(),
  id: z.string(),
  name: z.string(),
  schedule: ProjectMonitorSchedule,
  content: z.string().optional(),
  timeout: z.string().optional(),
  privateLocations: z.array(z.string()).optional(),
  locations: z.array(z.string()).optional(),
  throttling: ProjectMonitorThrottlingConfigCodec.optional(),
  screenshot: ScreenshotOptionCodec.optional(),
  tags: z.union([z.string(), z.array(z.string())]).optional(),
  ignoreHTTPSErrors: z.boolean().optional(),
  certificateErrorSpkiAllowlist: z.union([z.string(), z.array(z.string())]).optional(),
  playwrightOptions: z.record(z.string(), z.unknown()).optional(),
  filter: z.looseObject({ match: z.string() }).optional(),
  params: z.record(z.string(), z.unknown()).optional(),
  enabled: z.boolean().optional(),
  alert: AlertConfigsCodec.optional(),
  urls: z.union([z.string(), z.array(z.string())]).optional(),
  hosts: z.union([z.string(), z.array(z.string())]).optional(),
  max_redirects: z.union([z.string(), z.number()]).optional(),
  wait: z.string().optional(),
  hash: z.string().optional(),
  namespace: z.string().optional(),
  retestOnFailure: z.boolean().optional(),
  fields: z.record(z.string(), z.string()).optional(),
  'service.name': z.string().optional(),
  maintenanceWindows: z.array(z.string()).optional(),
  spaces: z.array(z.string()).optional(),
});

export const ProjectMonitorsRequestCodec = z.looseObject({
  monitors: z.array(ProjectMonitorCodec),
});

export const LegacyProjectMonitorsRequestCodec = z.looseObject({
  project: z.string(),
  keep_stale: z.boolean(),
  monitors: z.array(ProjectMonitorCodec),
});

export const ProjectMonitorMetaDataCodec = z.looseObject({
  hash: z.string(),
  journey_id: z.string(),
});

export const ProjectMonitorsResponseCodec = z.looseObject({
  total: z.number(),
  monitors: z.array(ProjectMonitorMetaDataCodec),
  after_key: z.string().optional(),
});
