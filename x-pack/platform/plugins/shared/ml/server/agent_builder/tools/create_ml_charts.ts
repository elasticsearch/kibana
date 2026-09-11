/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { ToolType } from '@kbn/agent-builder-common';
import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';
import type { BuiltinSkillBoundedTool } from '@kbn/agent-builder-server/skills';
import { createErrorResult, getToolResultId } from '@kbn/agent-builder-server';
import type { SeverityThreshold } from '@kbn/ml-server-schemas/embeddables/anomaly_charts';
import type { ResolveMlCapabilities } from '@kbn/ml-common-types/capabilities';
import type { MlLicense } from '../../../common/license';
import type { MlFeatures } from '../../../common/constants/app';
import type { MlAuthorizationService } from '../../lib/capabilities/check_capabilities';
import { hasMlCapabilitiesProvider } from '../../lib/capabilities/check_capabilities';
import type { BuildMlClientFn } from '../ml_client_factory';
import {
  ANOMALY_SWIMLANE_ATTACHMENT_TYPE,
  ANOMALY_CHARTS_ATTACHMENT_TYPE,
  SINGLE_METRIC_VIEWER_ATTACHMENT_TYPE,
} from '../attachment_types/constants';
import { CREATE_ML_CHARTS_TOOL_ID } from './tool_ids';

const schema = z.object({
  chart_type: z
    .enum(['anomaly_swimlane', 'anomaly_charts', 'single_metric_viewer'])
    .describe(
      'Which ML chart to render. "anomaly_swimlane": heatmap overview of which entity was anomalous and when. "anomaly_charts": multi-series time series showing actual values vs model bounds for several entities. "single_metric_viewer": one entity, one detector — actual metric with confidence bounds, anomaly markers, optional forecast.'
    ),
  job_ids: z
    .array(z.string().min(1).max(1000))
    .min(1)
    .max(10000)
    .describe(
      'IDs of the anomaly detection jobs or groups. Must be verified to exist via ml.ad_get_job_info before calling. For single_metric_viewer, exactly one job ID is required.'
    ),
  swimlane_type: z
    .enum(['overall', 'viewBy'])
    .optional()
    .describe(
      '(anomaly_swimlane only) "overall" for a single aggregated heatmap row. "viewBy" to split by a field — requires view_by. Default: derive from job config (prefer viewBy when a partition/by/over field exists).'
    ),
  view_by: z
    .string()
    .min(1)
    .max(1000)
    .optional()
    .describe(
      '(anomaly_swimlane viewBy only) Exact field name used to split anomalies (e.g. "host.name"). Derive from job config (partition_field_name → by_field_name → over_field_name).'
    ),
  per_page: z
    .number()
    .min(1)
    .optional()
    .describe('(anomaly_swimlane viewBy only) Number of rows to display per page.'),
  max_series_to_plot: z
    .number()
    .min(1)
    .max(50)
    .optional()
    .describe('(anomaly_charts only) Maximum number of anomaly series to plot. Defaults to 6.'),
  selected_detector_index: z
    .number()
    .min(0)
    .optional()
    .describe(
      '(single_metric_viewer only) Zero-based index of the detector within the job. Use the detector_index from the anomaly record. Defaults to 0.'
    ),
  selected_entities: z
    .record(z.string().max(1000), z.union([z.string(), z.number(), z.boolean()]).optional())
    .optional()
    .describe(
      '(single_metric_viewer only) Key-value map of partition/by/over field → value (e.g. {"host.name": "web-01"}). Populate from anomaly record fields (partition_field_value, by_field_value, over_field_value) from prior RCA results.'
    ),
  function_description: z
    .string()
    .max(1000)
    .optional()
    .describe(
      '(single_metric_viewer only) For metric-function detectors: which value to plot — "min", "max", or "mean". Omit for other functions.'
    ),
  forecast_id: z
    .string()
    .max(1000)
    .optional()
    .describe('(single_metric_viewer only) Identifier of a forecast to overlay on the chart.'),
  severity_threshold: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .describe(
      'Minimum anomaly score (0–100) to show. Typical values: 25 (minor+), 50 (major+), 75 (critical only). Omit to show all anomalies.'
    ),
  time_range: z
    .object({
      from: z
        .string()
        .describe('Start of the time range (ISO 8601 or Kibana date math, e.g. "now-7d").'),
      to: z.string().describe('End of the time range (ISO 8601 or Kibana date math, e.g. "now").'),
    })
    .optional()
    .describe(
      'Time range for the chart. Set to the analysis window for historical/batch jobs — omitting defaults to "last 15 minutes" which shows no data for historical jobs. Omit only for realtime jobs that should track the current time range.'
    ),
  title: z.string().max(500).optional().describe('Descriptive panel title.'),
});

/**
 * Maps a minimum score (0–100) to the SeverityThreshold[] format expected by
 * the anomaly charts embeddable. Uses a single open-ended floor so any value
 * in range filters as `score >= minScore`, matching the swim lane path.
 */
export const buildAnomalyChartsThresholds = (minScore: number): SeverityThreshold[] => [
  { min: minScore },
];

export const createMlChartsTool = (
  resolveMlCapabilities: ResolveMlCapabilities,
  authorization?: MlAuthorizationService,
  mlLicense?: MlLicense,
  enabledFeatures?: MlFeatures,
  buildMlClient?: BuildMlClientFn
): BuiltinSkillBoundedTool<typeof schema> => ({
  id: CREATE_ML_CHARTS_TOOL_ID,
  type: ToolType.builtin,
  description: `Create an inline ML chart attachment for anomaly detection results. Renders one of three interactive chart types directly in the conversation.

**Requires Platinum or higher license.**

**chart_type values:**
- \`anomaly_swimlane\`: Heatmap overview — which entity was anomalous and when. Use first after investigation to show the overall picture. Requires \`swimlane_type\`.
- \`anomaly_charts\`: Multi-series time series — actual values vs model bounds for several entities. Use after swim lane to compare top anomalous entities.
- \`single_metric_viewer\`: One entity, one detector — actual metric with confidence bounds, anomaly markers, optional forecast. Use for drill-down on a specific entity. Requires exactly one job ID.

**Always verify job IDs exist** via ml.ad_get_job_info before calling. Never invent job IDs.

**time_range**: Set to the analysis window for historical/batch jobs — omitting defaults to "last 15 minutes" which shows no data for historical jobs.

After the tool succeeds, render the chart inline by emitting:
\`<render_attachment id="{attachment_id}" version="{version}" />\`

The returned \`config\` in the result can also be forwarded to \`platform.dashboard.generate_dashboard\` if the user asks to add the chart to a dashboard (use \`source: "config"\` with the appropriate panel type).`,
  experimental: true,
  schema,
  handler: async (params, { esClient, savedObjectsClient, request, logger, attachments }) => {
    const hasMlCapabilities = hasMlCapabilitiesProvider(
      resolveMlCapabilities,
      request,
      authorization,
      mlLicense,
      enabledFeatures
    );

    try {
      await hasMlCapabilities(['canGetJobs']);
    } catch (error) {
      return {
        results: [
          createErrorResult(`Cannot create ML chart due to missing capabilities: ${error.message}`),
        ],
      };
    }

    if (!mlLicense?.isFullLicense()) {
      return {
        results: [
          createErrorResult(
            'ML chart attachments require a Platinum or higher license. This feature is not available on the current license.'
          ),
        ],
      };
    }

    const { chart_type: chartType } = params;

    try {
      let attachmentType: string;
      let attachmentData: Record<string, unknown>;
      let description: string;

      if (chartType === 'anomaly_swimlane') {
        if (!params.swimlane_type) {
          return {
            results: [createErrorResult('swimlane_type is required for anomaly_swimlane charts.')],
          };
        }
        if (params.swimlane_type === 'viewBy' && !params.view_by) {
          return {
            results: [createErrorResult('view_by is required when swimlane_type is "viewBy".')],
          };
        }
        attachmentType = ANOMALY_SWIMLANE_ATTACHMENT_TYPE;
        attachmentData = {
          job_ids: params.job_ids,
          swimlane_type: params.swimlane_type,
          ...(params.view_by && { view_by: params.view_by }),
          ...(params.per_page != null && { per_page: params.per_page }),
          ...(params.severity_threshold != null && {
            severity_threshold: params.severity_threshold,
          }),
          ...(params.time_range && { time_range: params.time_range }),
          ...(params.title && { title: params.title }),
        };
        description = `Anomaly swim lane: ${params.job_ids.join(', ')}`;
      } else if (chartType === 'anomaly_charts') {
        const severityThresholds =
          params.severity_threshold != null
            ? buildAnomalyChartsThresholds(params.severity_threshold)
            : undefined;
        attachmentType = ANOMALY_CHARTS_ATTACHMENT_TYPE;
        attachmentData = {
          job_ids: params.job_ids,
          ...(params.max_series_to_plot != null && {
            max_series_to_plot: params.max_series_to_plot,
          }),
          ...(severityThresholds &&
            severityThresholds.length > 0 && { severity_threshold: severityThresholds }),
          ...(params.time_range && { time_range: params.time_range }),
          ...(params.title && { title: params.title }),
        };
        description = `Anomaly charts: ${params.job_ids.join(', ')}`;
      } else {
        // single_metric_viewer
        if (params.job_ids.length !== 1) {
          return {
            results: [
              createErrorResult('single_metric_viewer requires exactly one job ID in job_ids.'),
            ],
          };
        }

        // Validate that all required entity fields for the chosen detector are provided
        // in selected_entities — otherwise the embeddable shows an empty callout instead of a chart.
        const detectorIndex = params.selected_detector_index ?? 0;
        try {
          const mlClient = buildMlClient?.(esClient, savedObjectsClient, request);
          const jobsApi = mlClient ?? esClient.asCurrentUser.ml;
          const jobResponse = await jobsApi.getJobs({
            job_id: params.job_ids[0],
          });
          const job = jobResponse.jobs?.[0];
          const detector = job?.analysis_config?.detectors?.[detectorIndex];
          if (detector) {
            const requiredFields = [
              detector.partition_field_name,
              detector.by_field_name,
              detector.over_field_name,
            ].filter((f): f is string => typeof f === 'string');
            const provided = params.selected_entities ?? {};
            const missing = requiredFields.filter(
              (f) => !(f in provided) || provided[f] == null || provided[f] === ''
            );
            if (missing.length > 0) {
              return {
                results: [
                  createErrorResult(
                    `single_metric_viewer cannot render: the selected detector requires values for the following entity field${
                      missing.length > 1 ? 's' : ''
                    }: ${missing.map((f) => `"${f}"`).join(', ')}. ` +
                      `Provide them via selected_entities (e.g. from a prior anomaly record's partition_field_value / by_field_value / over_field_value).`
                  ),
                ],
              };
            }
          }
        } catch (fetchError) {
          logger.warn(
            `Could not validate detector entity fields for job ${params.job_ids[0]}: ${
              fetchError instanceof Error ? fetchError.message : String(fetchError)
            }`
          );
          // Non-fatal: proceed and let the embeddable show its own validation state.
        }

        attachmentType = SINGLE_METRIC_VIEWER_ATTACHMENT_TYPE;
        attachmentData = {
          job_ids: params.job_ids,
          selected_detector_index: params.selected_detector_index ?? 0,
          ...(params.selected_entities && { selected_entities: params.selected_entities }),
          ...(params.function_description && {
            function_description: params.function_description,
          }),
          ...(params.forecast_id && { forecast_id: params.forecast_id }),
          ...(params.time_range && { time_range: params.time_range }),
          ...(params.title && { title: params.title }),
        };
        description = `Single metric viewer: ${params.job_ids[0]}`;
      }

      const newAttachment = await attachments.add({
        type: attachmentType,
        data: attachmentData,
        description,
      });

      logger.debug(`Created ML chart attachment ${newAttachment.id} (type: ${attachmentType})`);

      return {
        results: [
          {
            tool_result_id: getToolResultId(),
            type: ToolResultType.other,
            data: {
              attachment_id: newAttachment.id,
              version: newAttachment.current_version,
              chart_type: chartType,
              config: attachmentData,
            },
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to create ML chart attachment: ${message}`);
      return {
        results: [createErrorResult(`Failed to create ML chart: ${message}`)],
      };
    }
  },
});
