/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AttachmentTypeDefinition } from '@kbn/agent-builder-server/attachments';
import {
  anomalySwimLaneEmbeddableStateSchema,
  type AnomalySwimLaneEmbeddableState,
} from '@kbn/ml-server-schemas/embeddables/anomaly_swimlane';
import { ANOMALY_SWIMLANE_ATTACHMENT_TYPE } from './constants';

export const createAnomalySwimLaneAttachmentType = (): AttachmentTypeDefinition<
  typeof ANOMALY_SWIMLANE_ATTACHMENT_TYPE,
  AnomalySwimLaneEmbeddableState
> => ({
  id: ANOMALY_SWIMLANE_ATTACHMENT_TYPE,

  validate: (input) => {
    const result = anomalySwimLaneEmbeddableStateSchema.safeParse(input);
    if (result.success) return { valid: true, data: result.data };
    return { valid: false, error: result.error.message };
  },

  format: (attachment) => ({
    getRepresentation: () => {
      const { data } = attachment;
      const lines: string[] = [
        'ML Anomaly Swim Lane attachment',
        `Jobs: ${data.job_ids.join(', ')}`,
        `Type: ${data.swimlane_type}`,
      ];
      if ('view_by' in data && data.view_by) lines.push(`View by: ${data.view_by}`);
      if (data.severity_threshold != null)
        lines.push(`Severity threshold: ${data.severity_threshold}`);
      return { type: 'text' as const, value: lines.join('\n') };
    },
  }),

  isReadonly: false,

  getAgentDescription: () =>
    'An ML anomaly swim lane attachment renders an interactive heatmap showing anomaly scores over time, split by entity when using viewBy mode. Render it inline with <render_attachment id="{attachment_id}" version="{version}" />. The config can also be forwarded to the dashboard generation tool as a panel with source: "config" and type: "ml_anomaly_swimlane".',

  getTools: () => [],
});
