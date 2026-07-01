/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { MonitorAttachmentData } from '../../../common/agent_builder/attachments/monitor_attachment_schema';

// Thin payload — the Synthetics server normalises and fills defaults for
// every other ConfigKey on the canonical MonitorFields shape.
export interface MonitorRequestBody {
  type: 'http';
  name: string;
  urls: string;
  schedule: { number: string; unit: 'm' };
  locations: Array<{ id: string; label: string; isServiceManaged?: boolean }>;
  description?: string;
  tags?: string[];
  enabled?: boolean;
}

export const buildMonitorRequestBody = (data: MonitorAttachmentData): MonitorRequestBody => {
  const { metadata, urls, schedule, locations, enabled } = data;

  return {
    type: 'http',
    name: metadata.name,
    urls,
    schedule,
    // The Synthetics POST handler treats `label` as required on the canonical
    // `SyntheticsMonitor.locations` shape; the agent's `manage_monitor` tool
    // schema accepts it as optional, so fall back to the id when missing.
    locations: locations.map((location) => ({
      id: location.id,
      label: location.label ?? location.id,
      ...(location.isServiceManaged !== undefined
        ? { isServiceManaged: location.isServiceManaged }
        : {}),
    })),
    ...(metadata.description !== undefined ? { description: metadata.description } : {}),
    ...(metadata.tags !== undefined ? { tags: metadata.tags } : {}),
    ...(enabled !== undefined ? { enabled } : {}),
  };
};
