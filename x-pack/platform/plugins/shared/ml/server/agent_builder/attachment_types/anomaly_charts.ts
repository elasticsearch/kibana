/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AttachmentTypeDefinition } from '@kbn/agent-builder-server/attachments';
import {
  anomalyChartsEmbeddableStateSchema,
  type AnomalyChartsEmbeddableState,
} from '@kbn/ml-server-schemas/embeddables/anomaly_charts';
import { ANOMALY_CHARTS_ATTACHMENT_TYPE } from './constants';

export const createAnomalyChartsAttachmentType = (): AttachmentTypeDefinition<
  typeof ANOMALY_CHARTS_ATTACHMENT_TYPE,
  AnomalyChartsEmbeddableState
> => ({
  id: ANOMALY_CHARTS_ATTACHMENT_TYPE,

  validate: (input) => {
    const result = anomalyChartsEmbeddableStateSchema.safeParse(input);
    if (result.success) return { valid: true, data: result.data };
    return { valid: false, error: result.error.message };
  },

  format: (attachment) => ({
    getRepresentation: () => {
      const { data } = attachment;
      const lines: string[] = ['ML Anomaly Charts attachment', `Jobs: ${data.job_ids.join(', ')}`];
      if (data.max_series_to_plot != null) lines.push(`Max series: ${data.max_series_to_plot}`);
      return { type: 'text' as const, value: lines.join('\n') };
    },
  }),

  isReadonly: false,

  getAgentDescription: () =>
    'An ML anomaly charts attachment renders multiple time-series charts — one per anomalous entity — showing actual metric values alongside model bounds and anomaly markers. Render it inline with <render_attachment id="{attachment_id}" version="{version}" />. The config can also be forwarded to the dashboard generation tool as a panel with source: "config" and type: "ml_anomaly_charts".',

  getTools: () => [],
});
