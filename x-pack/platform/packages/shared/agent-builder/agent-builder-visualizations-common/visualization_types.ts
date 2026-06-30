/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Data for a visualization attachment, discriminated by `renderer`.
 *
 * This is the cross-runtime contract for the visualization attachment (consumed
 * by both the browser renderer and the server). Runtime validation lives in the
 * `agent_builder_visualizations` plugin server (`visualizationAttachmentDataSchema`).
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
