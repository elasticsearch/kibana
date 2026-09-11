/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SmlTypeDefinition } from '@kbn/agent-builder-sml-plugin/server';
import { getSmlOriginId, kibanaPermissions } from '@kbn/agent-builder-sml-plugin/server';
import { isSavedObjectErrorResult } from '@kbn/core/server';
import type { LensAttributes } from '@kbn/lens-embeddable-utils';
import { VISUALIZATION_KI_TYPE } from '@kbn/agent-builder-elastic-ai-index-ki-types';
import {
  withLensReferences,
  toLensApiConfig,
  toSupportedChartType,
  extractEsqlFromLens,
} from '../lens_reference';

const getChartType = (attributes: LensAttributes): string => {
  return attributes.visualizationType ?? '';
};

export const visualizationSmlType: SmlTypeDefinition = {
  id: VISUALIZATION_KI_TYPE,
  fetchFrequency: () => '1h',

  async *list(context) {
    const finder = context.savedObjectsClient.createPointInTimeFinder({
      type: 'lens',
      perPage: 1000,
      namespaces: ['*'],
      fields: ['title'],
    });

    try {
      for await (const response of finder.find()) {
        yield response.saved_objects.map((so) => ({
          id: so.id,
          updatedAt: so.updated_at ?? new Date().toISOString(),
          spaces: so.namespaces ?? [],
        }));
      }
    } finally {
      await finder.close();
    }
  },

  getSmlEntry: async (originId, context) => {
    try {
      const so = await context.savedObjectsClient.get('lens', originId);
      const attrs = so.attributes as LensAttributes;
      const title = attrs.title ?? originId;
      const esql = extractEsqlFromLens(attrs);
      const chartType = getChartType(attrs);
      const description = (attrs as { description?: string }).description ?? '';

      const contentParts = [title, description, chartType, esql].filter(Boolean);

      return {
        type: VISUALIZATION_KI_TYPE,
        title,
        content: contentParts.join('\n'),
      };
    } catch (error) {
      context.logger.warn(
        `SML visualization: failed to get data for '${originId}': ${(error as Error).message}`
      );
      return undefined;
    }
  },

  getPermissions: () => kibanaPermissions({ kiType: VISUALIZATION_KI_TYPE }),

  toAttachment: async (item, context) => {
    const originId = getSmlOriginId(item);
    const resolveResult = await context.savedObjectsClient.resolve('lens', originId);
    const savedObject = resolveResult.saved_object;
    if (isSavedObjectErrorResult(savedObject)) {
      return undefined;
    }

    const lensAttributes = withLensReferences(
      savedObject.attributes as LensAttributes,
      savedObject.references
    );
    const lensApiConfig = toLensApiConfig(lensAttributes);

    return {
      type: VISUALIZATION_KI_TYPE,
      data: {
        query: lensAttributes.title ?? originId,
        visualization: lensApiConfig as unknown as Record<string, unknown>,
        chart_type: toSupportedChartType(lensApiConfig.type),
        esql: extractEsqlFromLens(lensAttributes),
      },
    };
  },
};
