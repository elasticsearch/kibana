/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';

/**
 * List of internal / built-in attachment types.
 *
 * The list is not fixed, as contributors can add their own attachment types.
 */
export enum AttachmentType {
  screenContext = 'screen_context',
  text = 'text',
  esql = 'esql',
  visualization = 'visualization',
  connector = 'connector',
}

interface AttachmentDataMap {
  [AttachmentType.esql]: EsqlAttachmentData;
  [AttachmentType.text]: TextAttachmentData;
  [AttachmentType.screenContext]: ScreenContextAttachmentData;
  [AttachmentType.visualization]: VisualizationAttachmentData;
  [AttachmentType.connector]: ConnectorAttachmentData;
}

export const esqlAttachmentDataSchema = z.object({
  query: z.string(),
  description: z.string().optional(),
});

/**
 * Data for an esql attachment.
 */
export interface EsqlAttachmentData {
  /** the esql query */
  query: string;
  /** optional description of the query */
  description?: string;
}

export const textAttachmentDataSchema = z.object({
  content: z.string(),
});

/**
 * Data for a text attachment.
 */
export interface TextAttachmentData {
  /** text content of the attachment */
  content: string;
}

export const screenContextTimeRangeSchema = z.object({
  from: z.string(),
  to: z.string(),
});

export interface TimeRange {
  from: string;
  to: string;
}

export const screenContextAttachmentDataSchema = z
  .object({
    url: z.string().optional(),
    app: z.string().optional(),
    description: z.string().optional(),
    time_range: screenContextTimeRangeSchema.optional(),
    additional_data: z.record(z.string(), z.string()).optional(),
  })
  .check((ctx) => {
    // at least one of the fields must be present
    const data = ctx.value;
    if (!data.url && !data.app && !data.description && !data.additional_data) {
      ctx.issues.push({
        code: 'custom',
        message: 'At least one of url, app, description, or additional_data must be present',
        input: data,
      });
    }
  });

/**
 * Data for a screen context attachment.
 */
export interface ScreenContextAttachmentData {
  /** current url */
  url?: string;
  /** kibana app name */
  app?: string;
  /** app description */
  description?: string;
  /** the currently active time range */
  time_range?: TimeRange;
  /** arbitrary additional context data */
  additional_data?: Record<string, string>;
}

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

/**
 * Tag prefix used to associate tools with their parent connector instance.
 * A tool tagged `connector:<connectorId>` belongs to that connector.
 */
export const CONNECTOR_TAG_PREFIX = 'connector:';

export const connectorAttachmentDataSchema = z.object({
  connector_id: z.string(),
  connector_name: z.string(),
  connector_type: z.string(),
});

/**
 * Data for a connector attachment.
 */
export interface ConnectorAttachmentData {
  /** The saved connector instance ID */
  connector_id: string;
  /** Human-readable connector name */
  connector_name: string;
  /** Action type ID (e.g., ".slack2", ".mcp") */
  connector_type: string;
}

export type AttachmentDataOf<Type extends AttachmentType> = AttachmentDataMap[Type];
