/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod';
import { MonitorOriginCodec } from './heartbeat_monitor';
import {
  AgentType,
  ErrorStateCodec,
  MonitorType,
  ObserverCodec,
  PingErrorType,
  UrlType,
} from './ping';
import { remoteMonitorInfoSchema } from './remote';

export const OverviewPingCodec = z.looseObject({
  '@timestamp': z.string(),
  summary: z.looseObject({
    down: z.number().optional(),
    up: z.number().optional(),
  }),
  monitor: MonitorType,
  observer: ObserverCodec,
  config_id: z.string(),
  agent: AgentType,
  url: UrlType,
  state: ErrorStateCodec,
  error: PingErrorType.optional(),
  tags: z.array(z.string()).optional(),
  service: z.looseObject({ name: z.string() }).optional(),
  labels: z.record(z.string(), z.string()).optional(),
});

export const OverviewStatusMetaDataCodec = z.looseObject({
  monitorQueryId: z.string(),
  configId: z.string(),
  locations: z.array(
    z.looseObject({
      id: z.string(),
      label: z.string(),
      status: z.string(),
      lastStatus: z.string().optional(),
      downSince: z.string().optional(),
      error: z
        .looseObject({
          message: z.string().optional(),
          type: z.string().optional(),
        })
        .optional(),
    })
  ),
  name: z.string(),
  schedule: z.string(),
  isEnabled: z.boolean(),
  tags: z.array(z.string()),
  isStatusAlertEnabled: z.boolean(),
  type: z.string(),
  overallStatus: z.string(),
  projectId: z.string().optional(),
  updated_at: z.string().optional(),
  timestamp: z.string().optional(),
  spaces: z.array(z.string()).optional(),
  urls: z.string().optional(),
  maintenanceWindows: z.array(z.string()).optional(),
  remote: remoteMonitorInfoSchema.optional(),
  origin: MonitorOriginCodec.optional(),
});

export const OverviewStatusCodec = z.looseObject({
  allMonitorsCount: z.number(),
  disabledMonitorsCount: z.number(),
  projectMonitorsCount: z.number(),
  up: z.number(),
  down: z.number(),
  pending: z.number(),
  stale: z.number(),
  disabledCount: z.number(),
  upConfigs: z.record(z.string(), OverviewStatusMetaDataCodec),
  downConfigs: z.record(z.string(), OverviewStatusMetaDataCodec),
  pendingConfigs: z.record(z.string(), OverviewStatusMetaDataCodec),
  staleConfigs: z.record(z.string(), OverviewStatusMetaDataCodec),
  disabledConfigs: z.record(z.string(), OverviewStatusMetaDataCodec),
  enabledMonitorQueryIds: z.array(z.string()),
  disabledMonitorQueryIds: z.array(z.string()),
  allIds: z.array(z.string()),
});

export const PaginatedOverviewStatusCodec = OverviewStatusCodec.extend({
  configs: z.array(OverviewStatusMetaDataCodec).optional(),
  total: z.number().optional(),
  page: z.number().optional(),
  perPage: z.number().optional(),
});

export const OverviewStalePriorRunCodec = z.looseObject({
  monitorQueryId: z.string(),
  locationId: z.string(),
  timestamp: z.string(),
  status: z.string(),
});

export const OverviewStaleStatusCodec = z.looseObject({
  priorRuns: z.array(OverviewStalePriorRunCodec),
});
