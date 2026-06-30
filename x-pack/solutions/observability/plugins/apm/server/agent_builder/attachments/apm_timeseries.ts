/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AttachmentTypeDefinition } from '@kbn/agent-builder-server/attachments';
import {
  APM_TIMESERIES_ATTACHMENT_TYPE,
  apmTimeseriesAttachmentDataSchema,
  type ApmTimeseriesAttachmentData,
} from '../../../common/agent_builder/attachments';

export const createApmTimeseriesAttachmentType = (): AttachmentTypeDefinition<
  typeof APM_TIMESERIES_ATTACHMENT_TYPE,
  ApmTimeseriesAttachmentData
> => {
  return {
    id: APM_TIMESERIES_ATTACHMENT_TYPE,
    validate: (input) => {
      const result = apmTimeseriesAttachmentDataSchema.safeParse(input);
      if (!result.success) {
        return { valid: false, error: result.error.message };
      }
      if (result.data.dataPoints.length === 0) {
        return { valid: false, error: 'Timeseries has no data points to display.' };
      }
      return { valid: true, data: result.data };
    },
    format: (attachment) => ({
      getRepresentation: () => ({
        type: 'text' as const,
        value: JSON.stringify(attachment.data),
      }),
    }),
    getAgentDescription: () =>
      'An APM timeseries chart showing a single metric (latency, failed transaction rate, or throughput) over time as a line chart. Supports an optional threshold line (e.g. alert rule threshold) and alert-window shading to highlight when an alert fired. Handles sparse / gappy data gracefully.',
    getTools: () => [],
  };
};
