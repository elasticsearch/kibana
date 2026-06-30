/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { platformCoreTools, ToolType } from '@kbn/agent-builder-common';
import type { BuiltinToolDefinition } from '@kbn/agent-builder-server';
import { getToolResultId } from '@kbn/agent-builder-server';
import { getLatestVersion } from '@kbn/agent-builder-common/attachments';
import {
  VISUALIZATION_ATTACHMENT_TYPE,
  type VisualizationAttachmentData,
} from '@kbn/agent-builder-visualizations-common';
import { ToolResultType, SupportedChartType } from '@kbn/agent-builder-common/tools/tool_result';
import {
  buildVisualizationConfig,
  buildVegaConfig,
  decideVisualizationApproach,
  type VisualizationConfig,
  type VisualizationRenderer,
} from '@kbn/agent-builder-visualizations-server';

/**
 * Pull the prior Lens config out of an existing attachment, when it is a Lens
 * visualization. Returns null for Vega attachments or unparseable data.
 */
const getExistingLensConfig = (
  data: VisualizationAttachmentData | undefined
): VisualizationConfig | null => {
  if (!data || data.renderer === 'vega') {
    return null;
  }
  const candidate = data.visualization;
  return candidate && typeof candidate === 'object' ? (candidate as VisualizationConfig) : null;
};

const getExistingVegaSpec = (data: VisualizationAttachmentData | undefined): string | undefined => {
  if (!data || data.renderer !== 'vega') {
    return undefined;
  }
  const candidate = data.visualization?.spec;
  return typeof candidate === 'string' ? candidate : undefined;
};

const createVisualizationSchema = z.object({
  query: z.string().describe('A natural language query describing the desired visualization.'),
  index: z
    .string()
    .optional()
    .describe(
      '(optional) Index, alias, or datastream to target. If not provided, the tool will attempt to discover the best index to use.'
    ),
  attachment_id: z
    .string()
    .optional()
    .describe(
      '(optional) ID of an existing visualization attachment to update. If provided, the tool will read the existing configuration and modify it based on the query.'
    ),
  chartType: z
    .nativeEnum(SupportedChartType)
    .optional()
    .describe(
      '(optional) Force a specific Lens chart type, e.g. when the user explicitly asks for one. Providing this always renders a Lens chart of that type. Omit it to let the tool choose the best Lens chart type or fall back to a custom Vega-Lite visualization when no Lens type fits.'
    ),
  esql: z
    .string()
    .optional()
    .describe(
      '(optional) An ES|QL query. If not provided, tool with automatically generate the query. Only pass ES|QL queries from reliable sources (other tool calls or the user) and NEVER invent queries directly.'
    ),
});

export const createVisualizationTool = (): BuiltinToolDefinition<
  typeof createVisualizationSchema
> => {
  return {
    id: platformCoreTools.createVisualization,
    type: ToolType.builtin,
    description: `Create or update a visualization from a natural language description. Supports BOTH standard Lens charts AND custom Vega-Lite visualizations, so prefer this tool over telling the user a chart cannot be built — you do not author Vega specs by hand or ask the user to paste anything.

The tool automatically chooses how to render the request:
- A standard Lens chart (${Object.values(SupportedChartType).join(
      ', '
    )}) whenever one of those types fits.
- A custom Vega-Lite specification when no Lens chart type can express the request, e.g. small multiples / faceting, layered or combination charts (bars plus an overlaid line), scatter / bubble plots with an encoded size dimension, or custom tooltips/encodings.

This tool will:
1. If attachment_id is provided, read the existing visualization from that attachment (edits keep the same renderer)
2. Decide whether to render with Lens or Vega, and pick the best Lens chart type when applicable
3. Generate an ES|QL query if not provided
4. Generate and validate the visualization (Lens config or Vega-Lite spec)
5. Store the result as an attachment (creating new or updating existing) for future modifications`,
    schema: createVisualizationSchema,
    tags: [],
    handler: async (
      { query: nlQuery, index, chartType, esql, attachment_id: attachmentId },
      { esClient, modelProvider, logger, events, attachments }
    ) => {
      try {
        // Step 1: Read any existing attachment so edits reuse its renderer + config.
        let existingData: VisualizationAttachmentData | undefined;
        if (attachmentId) {
          const existingAttachmentRecord = attachments.getAttachmentRecord(attachmentId);
          if (existingAttachmentRecord) {
            const latestVersion = getLatestVersion(existingAttachmentRecord);
            if (latestVersion?.data) {
              existingData = latestVersion.data as VisualizationAttachmentData;
              logger.debug(`Loaded existing visualization from attachment ${attachmentId}`);
            }
          } else {
            logger.warn(`Attachment ${attachmentId} not found, creating new visualization`);
          }
        }

        // Step 2: Decide the renderer. Keep an edited attachment on its current
        // renderer; an explicit chartType always means Lens; otherwise let the
        // model pick between Lens and Vega.
        let renderer: VisualizationRenderer;
        let decidedChartType: SupportedChartType | undefined;
        if (existingData) {
          renderer = existingData.renderer === 'vega' ? 'vega' : 'lens';
        } else if (chartType) {
          renderer = 'lens';
        } else {
          const approach = await decideVisualizationApproach(modelProvider, nlQuery);
          renderer = approach.renderer;
          if (approach.renderer === 'lens') {
            decidedChartType = approach.chartType;
          }
        }

        // Step 3: Generate the spec/config for the chosen renderer and assemble
        // the unified attachment data. `chart_type` is narrowed to
        // SupportedChartType so the same object also satisfies the tool result.
        let visualizationData: VisualizationAttachmentData & { chart_type?: SupportedChartType };

        if (renderer === 'vega') {
          const existingSpec = getExistingVegaSpec(existingData);
          const { spec, esqlQuery } = await buildVegaConfig({
            nlQuery,
            index,
            esql,
            existingSpec,
            modelProvider,
            logger,
            events,
            esClient,
          });
          visualizationData = {
            renderer: 'vega',
            query: nlQuery,
            visualization: { spec },
            esql: esqlQuery,
          };
        } else {
          const parsedExistingConfig = getExistingLensConfig(existingData);
          const existingConfig = parsedExistingConfig
            ? JSON.stringify(parsedExistingConfig)
            : undefined;
          const { selectedChartType, validatedConfig, esqlQuery, timeRange } =
            await buildVisualizationConfig({
              nlQuery,
              index,
              chartType: chartType ?? decidedChartType,
              esql,
              existingConfig,
              parsedExistingConfig,
              modelProvider,
              logger,
              events,
              esClient,
            });
          visualizationData = {
            renderer: 'lens',
            query: nlQuery,
            visualization: validatedConfig,
            chart_type: selectedChartType,
            esql: esqlQuery,
            ...(timeRange && { time_range: timeRange }),
          };
        }

        // Step 4: Try to store as attachment (optional - may fail if visualization type not registered)
        const description = `Visualization: ${nlQuery.slice(0, 50)}${
          nlQuery.length > 50 ? '...' : ''
        }`;
        try {
          if (attachmentId && attachments.getAttachmentRecord(attachmentId)) {
            const updated = await attachments.update(attachmentId, {
              data: visualizationData,
              description,
            });
            logger.debug(
              `Updated visualization attachment ${attachmentId} to version ${
                updated?.current_version ?? 1
              }`
            );
          } else {
            const newAttachment = await attachments.add({
              type: VISUALIZATION_ATTACHMENT_TYPE,
              data: visualizationData,
              description,
            });
            logger.debug(`Created new visualization attachment ${newAttachment.id}`);
          }
        } catch (attachmentError) {
          // Attachment creation is optional - continue without it
          logger.warn(
            `Could not create visualization attachment (type may not be registered): ${
              attachmentError instanceof Error ? attachmentError.message : String(attachmentError)
            }`
          );
        }

        return {
          results: [
            {
              type: ToolResultType.visualization,
              tool_result_id: getToolResultId(),
              data: visualizationData,
            },
          ],
        };
      } catch (error) {
        logger.error(`Error in create_visualization tool: ${error.message}`);
        return {
          results: [
            {
              type: ToolResultType.error,
              data: {
                message: `Failed to create visualization: ${error.message}`,
                metadata: { nlQuery, esql, chartType },
              },
            },
          ],
        };
      }
    },
  };
};
