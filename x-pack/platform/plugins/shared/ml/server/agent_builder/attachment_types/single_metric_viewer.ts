/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AttachmentTypeDefinition } from '@kbn/agent-builder-server/attachments';
import {
  singleMetricViewerEmbeddableStateSchema,
  type SingleMetricViewerEmbeddableState,
} from '@kbn/ml-server-schemas/embeddables/single_metric_viewer';
import { SINGLE_METRIC_VIEWER_ATTACHMENT_TYPE } from './constants';

export const createSingleMetricViewerAttachmentType = (): AttachmentTypeDefinition<
  typeof SINGLE_METRIC_VIEWER_ATTACHMENT_TYPE,
  SingleMetricViewerEmbeddableState
> => ({
  id: SINGLE_METRIC_VIEWER_ATTACHMENT_TYPE,

  validate: (input) => {
    const result = singleMetricViewerEmbeddableStateSchema.safeParse(input);
    if (result.success) return { valid: true, data: result.data };
    return { valid: false, error: result.error.message };
  },

  format: (attachment) => ({
    getRepresentation: () => {
      const { data } = attachment;
      const lines: string[] = [
        'ML Single Metric Viewer attachment',
        `Job: ${data.job_ids[0]}`,
        `Detector index: ${data.selected_detector_index}`,
      ];
      if (data.selected_entities) {
        const entityLines = Object.entries(data.selected_entities)
          .map(([k, v]) => `  ${k}: ${v}`)
          .join('\n');
        lines.push(`Entities:\n${entityLines}`);
      }
      if (data.forecast_id) lines.push(`Forecast: ${data.forecast_id}`);
      return { type: 'text' as const, value: lines.join('\n') };
    },
  }),

  isReadonly: false,

  getAgentDescription: () =>
    'An ML single metric viewer attachment renders a continuous time series for one detector in one job — actual metric values with model confidence bounds overlaid, anomaly markers, and an optional forecast band. Render it inline with <render_attachment id="{attachment_id}" version="{version}" />. The config can also be forwarded to the dashboard generation tool as a panel with source: "config" and type: "ml_single_metric_viewer".',

  getTools: () => [],
});
