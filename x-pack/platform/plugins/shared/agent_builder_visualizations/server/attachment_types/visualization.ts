/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  VISUALIZATION_ATTACHMENT_TYPE,
  type VisualizationAttachmentData,
} from '@kbn/agent-builder-visualizations-common';
import type {
  AttachmentResolveContext,
  AttachmentTypeDefinition,
} from '@kbn/agent-builder-server/attachments';
import {
  LensConfigBuilder,
  type LensApiConfig,
  type LensAttributes,
} from '@kbn/lens-embeddable-utils';
import { visualizationAttachmentDataSchema } from './visualization_schema';

/**
 * Creates the definition for the unified `visualization` attachment type.
 *
 * This type supports both:
 * - **By-value**: consumer provides content (`data`) directly.
 * - **By-reference**: consumer provides `origin` (a saved object ID string) →
 *   `resolve()` snapshots the content once at add time.
 *
 * After creation, all attachments behave identically — the agent doesn't know
 * whether something was originally by-reference.
 */
export const createVisualizationAttachmentType = (): AttachmentTypeDefinition<
  typeof VISUALIZATION_ATTACHMENT_TYPE,
  VisualizationAttachmentData
> => {
  return {
    id: VISUALIZATION_ATTACHMENT_TYPE,

    validate: (input) => {
      const parseResult = visualizationAttachmentDataSchema.safeParse(input);
      if (parseResult.success) {
        return { valid: true, data: parseResult.data };
      }
      return { valid: false, error: parseResult.error.message };
    },

    resolve: async (
      origin: string,
      context: AttachmentResolveContext
    ): Promise<VisualizationAttachmentData | undefined> => {
      if (!context.savedObjectsClient) return undefined;

      try {
        const resolveResult = await context.savedObjectsClient.resolve('lens', origin);
        const savedObject = resolveResult.saved_object as { error?: { message?: string } };

        if (savedObject?.error) {
          return undefined;
        }

        const lensAttributes = toLensAttributes(
          resolveResult.saved_object.attributes as LensAttributes,
          resolveResult.saved_object.references
        );

        const lensApiConfig = toLensApiConfig(lensAttributes);

        return {
          renderer: 'lens',
          query: origin,
          visualization: lensApiConfig as unknown as Record<string, unknown>,
          chart_type: extractChartType(lensAttributes),
          esql: extractEsql(lensAttributes),
        };
      } catch {
        return undefined;
      }
    },

    format: (attachment) => ({
      getRepresentation: () => {
        const { data } = attachment;
        const kindLine =
          data.renderer === 'vega'
            ? 'Renderer: Vega'
            : data.chart_type
            ? `Chart type: ${data.chart_type}`
            : 'Renderer: Lens';
        return {
          type: 'text',
          value: [
            'Visualization attachment',
            `Query: ${data.query}`,
            kindLine,
            `ES|QL: ${data.esql}`,
          ].join('\n'),
        };
      },
    }),

    isReadonly: false,

    getAgentDescription: () => {
      return 'A visualization attachment contains a shared visualization payload and a renderer discriminator (lens or vega). Vega specs live at visualization.spec. Time range can be controlled by configuring a time_range property directly on the attachment.data with from and to fields. Rendering it inline displays the visualization as a dynamic, interactive chart component in the conversation UI. Visualization attachments can also be added to dashboard compositions through dashboard panel-ingestion operations.';
    },

    getTools: () => [],
  };
};

const toLensAttributes = (
  attributes: LensAttributes,
  references: LensAttributes['references'] | undefined
): LensAttributes => ({
  ...attributes,
  references: references ?? attributes.references ?? [],
});

const toLensApiConfig = (attributes: LensAttributes): LensApiConfig =>
  new LensConfigBuilder().toAPIFormat(attributes);

const extractChartType = (attributes: LensAttributes): string => {
  try {
    const state = attributes.state;
    if (state?.visualization && typeof state.visualization === 'object') {
      const vizState = state.visualization as Record<string, unknown>;
      if (typeof vizState.preferredSeriesType === 'string') {
        return vizState.preferredSeriesType;
      }
    }
    return attributes.visualizationType ?? 'unknown';
  } catch {
    return 'unknown';
  }
};

const extractEsql = (attributes: LensAttributes): string => {
  try {
    const layers = (attributes.state?.datasourceStates as Record<string, unknown>)?.textBased as
      | { layers?: Record<string, { query?: { esql?: string } }> }
      | undefined;
    if (layers?.layers) {
      const firstLayer = Object.values(layers.layers)[0];
      if (firstLayer?.query?.esql) {
        return firstLayer.query.esql;
      }
    }
    return '';
  } catch {
    return '';
  }
};
