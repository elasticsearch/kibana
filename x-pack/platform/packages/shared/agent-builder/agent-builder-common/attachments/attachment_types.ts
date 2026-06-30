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
  connector = 'connector',
}

interface AttachmentDataMap {
  [AttachmentType.esql]: EsqlAttachmentData;
  [AttachmentType.text]: TextAttachmentData;
  [AttachmentType.screenContext]: ScreenContextAttachmentData;
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
