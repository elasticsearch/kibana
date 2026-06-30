/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';

export const visualizationTimeRangeSchema = z.object({
  from: z.string(),
  to: z.string(),
});

export const visualizationAttachmentDataSchema = z
  .object({
    // Optional for backwards compatibility: attachments created before the Vega
    // renderer existed have no `renderer` field and are implicitly Lens.
    renderer: z.enum(['lens', 'vega']).optional(),
    query: z.string(),
    visualization: z.record(z.string(), z.unknown()),
    chart_type: z.string().optional(),
    esql: z.string(),
    time_range: visualizationTimeRangeSchema.optional(),
  })
  .check((ctx) => {
    if (ctx.value.renderer === 'vega') {
      const spec = (ctx.value.visualization as { spec?: unknown }).spec;
      if (typeof spec !== 'string' || spec.length === 0) {
        ctx.issues.push({
          code: 'custom',
          message: 'Vega visualizations must provide visualization.spec',
          input: ctx.value,
        });
      }
    }
  });

/**
 * Data for a visualization attachment, discriminated by `renderer`.
 */
export interface VisualizationAttachmentData {
  /** Renderer discriminator. Omitted defaults to Lens for legacy attachments. */
  renderer?: 'lens' | 'vega';
  /** The display query */
  query: string;
  /** Visualization configuration payload. For Vega, includes a serialized spec. */
  visualization: Record<string, unknown> & { spec?: string };
  /** Optional chart type identifier (primarily used by Lens). */
  chart_type?: string;
  /** The ES|QL query backing the visualization. */
  esql: string;
  /** Optional time range for the visualization (e.g., { from: 'now-24h', to: 'now' }) */
  time_range?: { from: string; to: string };
}
