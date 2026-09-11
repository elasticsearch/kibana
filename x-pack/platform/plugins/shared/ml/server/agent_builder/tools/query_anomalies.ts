/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FieldValue } from '@elastic/elasticsearch/lib/api/types';
import { z } from '@kbn/zod/v4';
import { ToolType } from '@kbn/agent-builder-common';
import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';
import type { BuiltinSkillBoundedTool } from '@kbn/agent-builder-server/skills';
import { createErrorResult, getToolResultId } from '@kbn/agent-builder-server';
import { getIndexPatternFromESQLQuery, getLookupIndicesFromQuery } from '@kbn/esql-utils';
import type { ResolveMlCapabilities } from '@kbn/ml-common-types/capabilities';
import type { MlLicense } from '../../../common/license';
import type { MlFeatures } from '../../../common/constants/app';
import type { MlAuthorizationService } from '../../lib/capabilities/check_capabilities';
import { hasMlCapabilitiesProvider } from '../../lib/capabilities/check_capabilities';
import { QUERY_ANOMALIES_TOOL_ID } from './tool_ids';

/**
 * Index patterns that may be queried with the Kibana internal user.
 * Source-data queries (e.g. RCA evidence against datafeed indices) must use
 * platform.core.execute_esql as the current user instead.
 */
const ALLOWED_ML_INDEX_PREFIXES = [
  '.ml-anomalies',
  '.ml-config',
  '.ml-notifications',
  '.ml-annotations',
] as const;

const DEFAULT_LIMIT = 100;

const schema = z.object({
  query: z
    .string()
    .min(1)
    .describe(
      'The ES|QL query to execute against ML system indices. Copy a template verbatim from one of the referenced content files: esql-read-queries (records/timeline/influencers/RCA), esql-metadata-queries (job config/memory/datafeed/annotations), or esql-score-queries (model plots/forecasts/score reassessment). Do not construct a query from memory — always read the file first.'
    ),
  params: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .optional()
    .describe(
      '(Optional) Bound values for ?param placeholders (keys without ?), e.g. { "job_id_pattern": "*", "min_score": 25 }. Omit this field entirely when the query has no placeholders — do not pass an empty object.'
    ),
  limit: z
    .number()
    .optional()
    .default(DEFAULT_LIMIT)
    .describe(`(Optional) Max rows to return. Defaults to ${DEFAULT_LIMIT}.`),
});

const stripEsqlComments = (query: string): string => {
  const withoutBlockComments = query.replace(/\/\*[\s\S]*?\*\//g, ' ');
  return withoutBlockComments.replace(/\/\/[^\n]*/g, ' ');
};

/**
 * Collects every index the query may touch: FROM/TS sources and LOOKUP JOIN targets.
 */
export const extractReferencedIndices = (query: string): string[] => {
  const fromPattern = getIndexPatternFromESQLQuery(query);
  const fromIndices = fromPattern
    ? fromPattern
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
    : [];
  const lookupIndices = getLookupIndicesFromQuery(query);
  return [...new Set([...fromIndices, ...lookupIndices])];
};

export const isAllowedMlIndex = (index: string): boolean => {
  // Reject cross-cluster / remote sources — internal-user CCS is out of scope.
  if (index.includes(':')) {
    return false;
  }

  return ALLOWED_ML_INDEX_PREFIXES.some(
    (prefix) => index === prefix || index.startsWith(`${prefix}-`) || index.startsWith(`${prefix}*`)
  );
};

/**
 * Validates that every index referenced anywhere in the pipeline is an allowed
 * ML system index, and rejects ENRICH (policy → arbitrary index).
 * Returns an error message, or undefined when the query is allowed.
 */
export const validateMlSystemIndexQuery = (query: string): string | undefined => {
  // ENRICH uses policy names, not index names — cannot allow-list without
  // resolving the policy. Source-data enrichment must use platform.core.execute_esql.
  if (/\bENRICH\b/i.test(stripEsqlComments(query))) {
    return (
      'ENRICH is not permitted in this tool. ' +
      'For source-data enrichment use platform.core.execute_esql.'
    );
  }

  const indices = extractReferencedIndices(query);
  if (indices.length === 0) {
    return 'Query must start with a FROM clause targeting an allowed ML system index.';
  }

  const disallowed = indices.filter((index) => !isAllowedMlIndex(index));
  if (disallowed.length > 0) {
    return (
      `Query targets disallowed index/pattern(s): ${disallowed.join(', ')}. ` +
      `Only ${ALLOWED_ML_INDEX_PREFIXES.map((p) => `${p}*`).join(', ')} are permitted. ` +
      `For source-data indices use platform.core.execute_esql.`
    );
  }

  return undefined;
};

const applyLimit = (query: string, limit: number): string => {
  const trimmed = query.trimEnd();
  const limitMatch = trimmed.match(/\|\s*LIMIT\s+(\d+)\s*$/i);
  if (limitMatch) {
    const existing = Number(limitMatch[1]);
    if (existing <= limit) {
      return trimmed;
    }
    return `${trimmed.slice(0, limitMatch.index)}| LIMIT ${limit}`;
  }
  return `${trimmed}\n| LIMIT ${limit}`;
};

export const createQueryAnomaliesTool = (
  resolveMlCapabilities: ResolveMlCapabilities,
  authorization?: MlAuthorizationService,
  mlLicense?: MlLicense,
  enabledFeatures?: MlFeatures
): BuiltinSkillBoundedTool<typeof schema> => ({
  id: QUERY_ANOMALIES_TOOL_ID,
  type: ToolType.builtin,
  description: `## Before calling this tool — required

Read one of the referenced ES|QL content files and copy a complete query into \`query\`:
- \`esql-read-queries\` — anomaly records, timeline, influencers, RCA queries
- \`esql-metadata-queries\` — job config, annotations, memory health, datafeed gaps
- \`esql-score-queries\` — model plots, forecasts, score reassessment

**Never call this tool without \`query\`.** Do not pass \`{}\`, an empty string, or a section label like \`"ad_get_jobs"\` — always paste the full ES|QL block from the file.

---

Execute an ES|QL query against ML anomaly-detection system indices (.ml-anomalies-*, .ml-config, .ml-notifications-*, .ml-annotations-*) and return tabular results.

Pass the full ES|QL string in \`query\`. Only include \`params\` when the query contains \`?placeholders\` — omit the \`params\` field entirely when unused.

Example (no placeholders — omit params):
{
  "query": "FROM .ml-config | WHERE job_type == \\"anomaly_detector\\" | STATS job_count = COUNT(*), job_ids = VALUES(job_id)"
}

Example (with placeholders — bind every ?name):
{
  "query": "FROM .ml-anomalies-* | WHERE result_type == \\"record\\" AND job_id LIKE ?job_id_pattern AND record_score >= ?min_score | SORT record_score DESC | LIMIT 50",
  "params": { "job_id_pattern": "*", "min_score": 50 }
}

Allowed indices (internal user): \`.ml-anomalies-*\`, \`.ml-config\`, \`.ml-notifications-*\`, \`.ml-annotations-*\`.
For source-data indices use \`platform.core.execute_esql\` instead.

## API documentation
- ES|QL reference: https://www.elastic.co/docs/reference/query-languages/esql
- Anomaly detection guide: https://www.elastic.co/docs/explore-analyze/machine-learning/anomaly-detection
- Anomaly detection APIs: https://www.elastic.co/docs/api/doc/elasticsearch/group/endpoint-ml-anomaly`,
  experimental: true,
  schema,
  handler: async (
    { query: esqlQuery, params: esqlParams = {}, limit = DEFAULT_LIMIT },
    { esClient, request }
  ) => {
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
          createErrorResult(
            `Error querying anomalies due to missing capabilities: ${error.message}`
          ),
        ],
      };
    }

    // Validate if query is touching .ml indices
    const validationError = validateMlSystemIndexQuery(esqlQuery);
    if (validationError) {
      return { results: [createErrorResult(validationError)] };
    }

    const paramArray: Array<Record<string, FieldValue>> = Object.entries(esqlParams).map(
      ([key, value]) => ({ [key]: value })
    );
    const effectiveQuery = applyLimit(esqlQuery, limit);

    try {
      // ML viewers can get job results via ML privileges but often lack direct
      // index privileges on .ml-* system indices — run as the internal user.
      const result = await esClient.asInternalUser.esql.query({
        query: effectiveQuery,
        drop_null_columns: true,
        allow_partial_results: true,
        ...(paramArray.length > 0 ? { params: paramArray as unknown as FieldValue[] } : {}),
      });

      return {
        results: [
          {
            type: ToolResultType.query,
            data: {
              esql: effectiveQuery,
            },
          },
          {
            tool_result_id: getToolResultId(),
            type: ToolResultType.esqlResults,
            data: {
              source: 'esql',
              query: effectiveQuery,
              columns: result.columns,
              values: result.values,
            },
          },
        ],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        results: [createErrorResult(`Error executing ES|QL query: ${message}`)],
      };
    }
  },
});
