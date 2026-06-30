/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import { ToolType } from '@kbn/agent-builder-common';
import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';
import type { BuiltinToolDefinition } from '@kbn/agent-builder-server';
import { Streams, FIELD_DEFINITION_TYPES } from '@kbn/streams-schema';
import type {
  FieldCapsResponse,
  IndicesGetMappingResponse,
} from '@elastic/elasticsearch/lib/api/types';
import dateMath from '@kbn/datemath';
import dedent from 'dedent';
import { isIlmLifecycle } from '@kbn/streams-schema';
import type { GetScopedClients } from '../../../routes/types';
import {
  getUnmappedFields,
  UNMAPPED_SAMPLE_SIZE,
} from '../../../lib/streams/helpers/unmapped_fields';
import { getEffectiveLifecycle } from '../../../lib/streams/lifecycle/get_effective_lifecycle';
import type { IlmPoliciesResponse } from '../../../lib/streams/lifecycle/ilm_policies';
import { getEsqlView } from '../../../lib/streams/esql_views/manage_esql_views';
import {
  getDegradedDocCountsForStreams,
  getDocCountsForStreams,
  getFailedDocCountsForStreams,
} from '../../../routes/streams/doc_counts/get_streams_doc_counts';
import { getDocCountInTimeRange, getLastFailureTimestamp } from '../../utils/doc_count_utils';
import {
  STREAMS_INSPECT_STREAMS_TOOL_ID as INSPECT_STREAMS,
  STREAMS_DIAGNOSE_STREAM_TOOL_ID as DIAGNOSE_STREAM,
} from '../tool_ids';
import { classifyError } from '../../utils/error_utils';
import {
  computeQualityMetrics,
  computeFailedPct,
  detectFailureStoreStatus,
  buildRetentionInfo,
  formatBytes,
  getQualityAssessment,
} from '../../utils/quality_utils';
import { buildProcessingChain, buildFieldMappings } from '../../utils/hierarchy_utils';
import { getStreamConvention, getConventionHint } from '../../utils/convention_utils';
import { getEffectiveDynamicMapping, getUnmappedFieldsNote } from '../../utils/mapping_utils';

const STREAMS_SUPPORTED_TYPES = new Set<string>(FIELD_DEFINITION_TYPES);

const ASPECT_VALUES = [
  'overview',
  'schema',
  'quality',
  'lifecycle',
  'processing',
  'routing',
] as const;
type Aspect = (typeof ASPECT_VALUES)[number];

const inspectStreamsSchema = z.object({
  names: z
    .array(z.string())
    .describe(
      'Stream names to inspect. Use ["*"] for all streams. Examples: ["logs.ecs.nginx"], ["logs.ecs.nginx", "logs.otel.apache"], ["*"]'
    ),
  aspects: z
    .array(z.enum(ASPECT_VALUES))
    .optional()
    .default(['overview'])
    .describe(
      'What information to return. Default: ["overview"]. Options: overview, schema, quality, lifecycle, processing, routing. Use multiple aspects for a deep dive on specific streams.'
    ),
});

export const createInspectStreamsTool = ({
  getScopedClients,
  isServerless,
}: {
  getScopedClients: GetScopedClients;
  isServerless: boolean;
}): BuiltinToolDefinition<typeof inspectStreamsSchema> => ({
  id: INSPECT_STREAMS,
  type: ToolType.builtin,
  description: dedent(`
    Inspect one or many streams at once, returning only the requested aspects. Replaces the need to call multiple individual tools.

    **When to use:**
    - User asks "what streams do I have?" — use names: ["*"], aspects: ["overview"]
    - User asks about quality/storage across all streams — use names: ["*"], aspects: ["quality"] or ["lifecycle"]
    - User wants a deep dive on one stream — use names: ["logs.ecs.nginx"], aspects: ["overview", "schema", "processing", "routing"]
    - User asks about multiple specific streams — use names: ["stream1", "stream2"], aspects: ["overview", "quality"]

    **Aspects:**
    - overview: name, type, description, document count (always included for context)
    - schema: mapped fields (own + inherited with source attribution), unmapped fields from recent documents, dynamic_mapping setting, and an interpretive note explaining field indexing behavior for this stream
    - quality: assessment (primary interpretation — follow this), quality_score, pipeline_updated_at, last_failure_at, failure data per time window (last_5m, last_24h, since_pipeline_update — each with count and pct), failure store status
    - lifecycle: retention policy (effective, with phase summary for ILM), storage size, document count
    - processing: full processing chain with source attribution (own + inherited steps for wired streams)
    - routing: child stream routes with conditions (wired streams only)

    All aspects return current-state data. For time-windowed diagnostics, use ${DIAGNOSE_STREAM}.

    **Query streams:** Query streams are read-only ES|QL views and are included in names: ["*"] results. Only schema/quality/lifecycle/processing/routing aspects do not apply to them; instead, when overview is requested the result includes a \`query\` object with the resolved ES|QL (\`query.esql\`), the backing view name, and any field descriptions. Use it to understand what the stream selects and which sources it reads from.

    **Important:** The processing and schema aspects already include inherited ancestor data
    with source attribution. Do not call this tool on parent streams to check inherited
    configuration — it is already resolved in the child's result.

    **Efficiency:** Do not re-call for streams you already inspected in this conversation unless a write tool has modified them since. Results are current-state and remain valid until a write occurs.
  `),
  tags: ['streams'],
  schema: inspectStreamsSchema,
  handler: async ({ names, aspects }, { request, logger }) => {
    try {
      const { streamsClient, scopedClusterClient } = await getScopedClients({ request });
      const esClient = scopedClusterClient.asCurrentUser;
      const aspectSet = new Set<Aspect>(aspects);

      const resolvedNames = await resolveStreamNames(streamsClient, names);

      if (resolvedNames.length === 0) {
        return {
          results: [
            {
              type: ToolResultType.other,
              data: { summary: 'No streams found.', streams: {} },
            },
          ],
        };
      }

      const streams: Record<string, Record<string, unknown>> = {};

      for (const streamName of resolvedNames) {
        try {
          const entry = await buildStreamEntry({
            streamName,
            aspects: aspectSet,
            streamsClient,
            esClient,
            esClientAsSecondaryAuthUser: scopedClusterClient.asSecondaryAuthUser,
            isServerless,
            logger,
          });
          streams[streamName] = entry;
        } catch (streamErr) {
          streams[streamName] = {
            error: streamErr instanceof Error ? streamErr.message : String(streamErr),
          };
        }
      }

      const streamCount = Object.keys(streams).length;
      const summary =
        streamCount === 1
          ? `1 stream inspected (aspects: ${aspects.join(', ')})`
          : `${streamCount} streams inspected (aspects: ${aspects.join(', ')})`;

      return {
        results: [{ type: ToolResultType.other, data: { summary, streams } }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        results: [
          {
            type: ToolResultType.error,
            data: {
              message: `Failed to inspect streams: ${message}`,
              operation: 'inspect_streams',
              likely_cause: classifyError(err),
            },
          },
        ],
      };
    }
  },
});

const resolveStreamNames = async (
  streamsClient: {
    listStreamsWithDataStreamExistence: () => Promise<
      Array<{ stream: Streams.all.Definition; exists: boolean }>
    >;
  },
  names: string[]
): Promise<string[]> => {
  if (names.length === 1 && names[0] === '*') {
    const allStreams = await streamsClient.listStreamsWithDataStreamExistence();
    // `exists` reflects whether a backing data stream is present. Query streams are ES|QL
    // views with no backing data stream, so they always report `exists: false`; keep them
    // regardless so they are not invisible to the agent. The flag still filters out ingest
    // streams whose data stream has not been materialized yet.
    return allStreams
      .filter(({ stream, exists }) => exists || Streams.QueryStream.Definition.is(stream))
      .map(({ stream }) => stream.name);
  }
  return names;
};

const buildStreamEntry = async ({
  streamName,
  aspects,
  streamsClient,
  esClient,
  esClientAsSecondaryAuthUser,
  isServerless,
  logger,
}: {
  streamName: string;
  aspects: Set<Aspect>;
  streamsClient: Parameters<typeof resolveStreamNames>[0] & {
    getStream: (name: string) => Promise<Streams.all.Definition>;
    getAncestors: (name: string) => Promise<Streams.WiredStream.Definition[]>;
    getDescendants: (name: string) => Promise<Streams.WiredStream.Definition[]>;
    getDataStream: (name: string) => Promise<unknown>;
  };
  esClient: Parameters<typeof getDocCountsForStreams>[0]['esClient'];
  esClientAsSecondaryAuthUser: Parameters<
    typeof getDocCountsForStreams
  >[0]['esClientAsSecondaryAuthUser'];
  isServerless: boolean;
  logger: Logger;
}): Promise<Record<string, unknown>> => {
  const definition = await streamsClient.getStream(streamName);
  const entry: Record<string, unknown> = {};

  let streamType: string = 'unknown';
  if (Streams.WiredStream.Definition.is(definition)) {
    streamType = 'wired';
  } else if (Streams.ClassicStream.Definition.is(definition)) {
    streamType = 'classic';
  } else if (Streams.QueryStream.Definition.is(definition)) {
    streamType = 'query';
  }
  entry.type = streamType;

  if (streamType === 'wired') {
    entry.type_context =
      'Fully managed by Elastic. Uses dynamic: false — only explicitly mapped fields are indexed. ' +
      'Mappings are additive — a child cannot change a field type defined by its parent. ' +
      'Data flows through the tree until it reaches its destination (exclusive partitioning). ' +
      'Root streams are read-only except for routing.';
  } else if (streamType === 'classic') {
    entry.type_context =
      'Partially managed — underlying ES objects may be modified outside Streams ' +
      '(e.g. by Elastic Agent integrations). field_overrides only cover explicitly overridden fields.';
  } else if (streamType === 'query') {
    entry.type_context =
      'Read-only stream defined by an ES|QL query. Not part of the stream hierarchy. ' +
      'Cannot modify processing, lifecycle, or failure store. ' +
      'See the query field for the ES|QL definition and the sources it reads from.';
  }

  if (Streams.ingest.all.Definition.is(definition)) {
    const convention = getStreamConvention(definition);
    const conventionHint = getConventionHint(convention);
    entry.type_context = `${entry.type_context} ${conventionHint}`;
  }

  if (aspects.has('overview')) {
    entry.overview = {
      name: definition.name,
      description: definition.description || '',
    };
  }

  // Query streams have no ingest configuration, so the aspects below do not apply to them.
  // The ES|QL query is what defines them, so surface it (plus field descriptions) whenever the
  // overview is requested — otherwise the agent only sees an opaque name and gets confused.
  if (aspects.has('overview') && Streams.QueryStream.Definition.is(definition)) {
    entry.query = await buildQueryStreamDetails({ definition, esClient, logger });
  }

  if (aspects.has('schema') && Streams.ingest.all.Definition.is(definition)) {
    const isClassic = Streams.ClassicStream.Definition.is(definition);
    const convention = getStreamConvention(definition);
    const conventionHint = getConventionHint(convention);

    const [ancestors, sampleDocs, fieldCapsResponse, mappingResponse] = await Promise.all([
      streamsClient.getAncestors(streamName),
      esClient.search({
        index: streamName,
        sort: [{ '@timestamp': { order: 'desc' } }],
        size: UNMAPPED_SAMPLE_SIZE,
      }),
      isClassic
        ? esClient.fieldCaps({ index: streamName, fields: ['*'], include_unmapped: false })
        : (undefined as unknown as FieldCapsResponse),
      isClassic
        ? esClient.indices.getMapping({ index: streamName })
        : (undefined as unknown as IndicesGetMappingResponse),
    ]);

    if (isClassic && fieldCapsResponse) {
      const dynamicMapping = mappingResponse ? getEffectiveDynamicMapping(mappingResponse) : 'true';
      const { mappedFields, unmappedFields } = buildClassicSchemaWithFieldCaps(
        definition as Streams.ClassicStream.Definition,
        fieldCapsResponse,
        sampleDocs
      );
      entry.schema = {
        field_convention: convention,
        field_convention_hint: conventionHint,
        dynamic_mapping: dynamicMapping,
        unmapped_fields_note: getUnmappedFieldsNote(dynamicMapping),
        mapped_fields: mappedFields,
        unmapped_fields: unmappedFields,
        total_mapped: mappedFields.length,
        total_unmapped: unmappedFields.length,
      };
    } else {
      const mappedFields = buildFieldMappings(definition, ancestors);
      const unmappedFields = getUnmappedFields({ definition, ancestors, sampleDocs });
      entry.schema = {
        field_convention: convention,
        field_convention_hint: conventionHint,
        dynamic_mapping: 'false',
        unmapped_fields_note: getUnmappedFieldsNote(false),
        mapped_fields: mappedFields,
        unmapped_fields: unmappedFields,
        total_mapped: mappedFields.length,
        total_unmapped: unmappedFields.length,
      };
    }
  }

  if (aspects.has('quality') && Streams.ingest.all.Definition.is(definition)) {
    const endMs = Date.now();
    const start24h = dateMath.parse('now-24h')?.valueOf() ?? endMs - 24 * 60 * 60 * 1000;
    const start5m = dateMath.parse('now-5m')?.valueOf() ?? endMs - 5 * 60 * 1000;

    const [
      totalResults,
      degradedResults,
      failed24hResults,
      failed5mResults,
      totalCount5m,
      totalCount24h,
    ] = await Promise.all([
      getDocCountsForStreams({
        isServerless,
        esClient,
        esClientAsSecondaryAuthUser,
        streamName,
      }),
      getDegradedDocCountsForStreams({ esClient, streamName }),
      getFailedDocCountsForStreams({ esClient, start: start24h, end: endMs, streamName }),
      getFailedDocCountsForStreams({ esClient, start: start5m, end: endMs, streamName }),
      getDocCountInTimeRange({ esClient, streamName, start: start5m, end: endMs }),
      getDocCountInTimeRange({ esClient, streamName, start: start24h, end: endMs }),
    ]);

    const totalCount = totalResults.find((s) => s.stream === streamName)?.count ?? 0;
    const degradedCount = degradedResults.find((s) => s.stream === streamName)?.count ?? 0;
    const failedCount24h = failed24hResults.find((s) => s.stream === streamName)?.count ?? 0;
    const failedCount5m = failed5mResults.find((s) => s.stream === streamName)?.count ?? 0;
    const { degradedPct, quality } = computeQualityMetrics({
      totalCount,
      degradedCount,
      failedCount: failedCount24h,
      windowedTotalCount: totalCount24h,
    });

    let lastFailureAt: string | null = null;
    if (failedCount24h > 0) {
      lastFailureAt = await getLastFailureTimestamp({ esClient, streamName });
    }

    const pipelineUpdatedAt = definition.ingest.processing.updated_at;
    const pipelineUpdatedMs = new Date(pipelineUpdatedAt).getTime();
    const isRecentUpdate = pipelineUpdatedMs > 0 && endMs - pipelineUpdatedMs < 24 * 60 * 60 * 1000;

    let sinceUpdateCount: number | null = null;
    let sinceUpdatePct: number | null = null;
    if (isRecentUpdate && failedCount24h > 0) {
      const [sinceUpdateResults, totalCountSinceUpdate] = await Promise.all([
        getFailedDocCountsForStreams({
          esClient,
          start: pipelineUpdatedMs,
          end: endMs,
          streamName,
        }),
        getDocCountInTimeRange({ esClient, streamName, start: pipelineUpdatedMs, end: endMs }),
      ]);
      sinceUpdateCount = sinceUpdateResults.find((s) => s.stream === streamName)?.count ?? 0;
      sinceUpdatePct = computeFailedPct(sinceUpdateCount, totalCountSinceUpdate);
    }

    const pct5m = computeFailedPct(failedCount5m, totalCount5m);
    const pct24h = computeFailedPct(failedCount24h, totalCount24h);

    const assessment = getQualityAssessment(
      failedCount5m,
      failedCount24h,
      sinceUpdateCount,
      pct5m,
      pct24h
    );

    entry.quality = {
      assessment,
      quality_score: quality,
      quality_score_note: 'Based on 24h aggregates. Check assessment for temporal context.',
      pipeline_updated_at: pipelineUpdatedAt,
      ...(lastFailureAt && { last_failure_at: lastFailureAt }),
      failed_docs: {
        last_5m: { count: failedCount5m, pct: pct5m },
        last_24h: { count: failedCount24h, pct: pct24h },
        ...(sinceUpdateCount !== null &&
          sinceUpdatePct !== null && {
            since_pipeline_update: { count: sinceUpdateCount, pct: sinceUpdatePct },
          }),
      },
      degraded_docs: degradedCount,
      degraded_pct: Math.round(degradedPct * 100) / 100,
      total_docs: totalCount,
      failure_store_status: detectFailureStoreStatus(definition),
    };
  }

  if (aspects.has('lifecycle') && Streams.ingest.all.Definition.is(definition)) {
    try {
      const dataStream = await streamsClient.getDataStream(streamName);
      const lifecycle = await getEffectiveLifecycle({
        definition,
        streamsClient: streamsClient as Parameters<
          typeof getEffectiveLifecycle
        >[0]['streamsClient'],
        dataStream: dataStream as Parameters<typeof getEffectiveLifecycle>[0]['dataStream'],
      });
      const retentionInfo = buildRetentionInfo(lifecycle);

      if (isIlmLifecycle(lifecycle)) {
        try {
          const policyResponse = (await esClient.ilm.getLifecycle({
            name: lifecycle.ilm.policy,
          })) as IlmPoliciesResponse;
          const policyEntry = policyResponse[lifecycle.ilm.policy];
          if (policyEntry?.policy?.phases) {
            retentionInfo.policy_phases = Object.keys(policyEntry.policy.phases);
          }
        } catch (policyErr) {
          logger.warn(
            `Failed to fetch ILM policy "${lifecycle.ilm.policy}" for stream "${streamName}": ${
              policyErr instanceof Error ? policyErr.message : String(policyErr)
            }`
          );
        }
      }

      const statsResponse = await esClient.indices.stats({
        index: (dataStream as { name: string }).name,
        metric: ['docs', 'store'],
      });

      const totalStats = statsResponse._all?.primaries;

      entry.lifecycle = {
        retention: retentionInfo,
        storage_size_bytes: totalStats?.store?.size_in_bytes ?? 0,
        storage_size_human: formatBytes(totalStats?.store?.size_in_bytes ?? 0),
        document_count: totalStats?.docs?.count ?? 0,
      };
    } catch {
      entry.lifecycle = { error: 'Could not retrieve lifecycle stats' };
    }
  }

  if (aspects.has('processing') && Streams.ingest.all.Definition.is(definition)) {
    const ancestors = Streams.WiredStream.Definition.is(definition)
      ? await streamsClient.getAncestors(streamName)
      : [];
    const chain = buildProcessingChain(definition, ancestors);
    entry.processing = {
      processing_chain: chain,
      own_step_count: definition.ingest.processing.steps.length,
    };
  }

  if (aspects.has('routing') && Streams.WiredStream.Definition.is(definition)) {
    const descendants = await streamsClient.getDescendants(streamName);
    entry.routing = {
      routes: definition.ingest.wired.routing.map((r) => ({
        destination: r.destination,
        condition: r.where,
        status: r.status,
      })),
      route_count: definition.ingest.wired.routing.length,
      descendant_count: descendants.length,
    };
  }

  return entry;
};

/**
 * Resolves the inspectable details of a query stream. The stored definition only keeps a
 * reference to the ES|QL view, so the actual query is read back from the view (the source of
 * truth). Failures are reported inline rather than thrown so a single unreadable view does not
 * fail the whole inspection.
 */
const buildQueryStreamDetails = async ({
  definition,
  esClient,
  logger,
}: {
  definition: Streams.QueryStream.Definition;
  esClient: ElasticsearchClient;
  logger: Logger;
}): Promise<Record<string, unknown>> => {
  const { view } = definition.query;
  const details: Record<string, unknown> = { view };

  try {
    const esqlView = await getEsqlView({ esClient, logger, name: view });
    details.esql = esqlView.query;
  } catch (err) {
    details.esql_error = `Could not resolve ES|QL query from view "${view}": ${
      err instanceof Error ? err.message : String(err)
    }`;
  }

  if (definition.field_descriptions && Object.keys(definition.field_descriptions).length > 0) {
    details.field_descriptions = definition.field_descriptions;
  }

  return details;
};

interface ClassicMappedField {
  name: string;
  type: string;
  source: string;
  overridable?: boolean;
}

const isMetadataField = (name: string): boolean =>
  name.startsWith('_') || name === '' || name.endsWith('.keyword') || name.endsWith('.text');

const getFieldCapsType = (
  fieldEntry: Record<string, { type: string; metadata_field?: boolean }>
): string | null => {
  for (const [, info] of Object.entries(fieldEntry)) {
    if (info.metadata_field) return null;
    return info.type;
  }
  return null;
};

const buildClassicSchemaWithFieldCaps = (
  definition: Streams.ClassicStream.Definition,
  fieldCapsResponse: FieldCapsResponse,
  sampleDocs: { hits: { hits: Array<{ _source?: unknown }> } }
): { mappedFields: ClassicMappedField[]; unmappedFields: string[] } => {
  const overrides = definition.ingest.classic.field_overrides || {};
  const overrideNames = new Set(Object.keys(overrides));

  const mappedFields: ClassicMappedField[] = [];

  for (const [fieldName, fieldDef] of Object.entries(overrides)) {
    mappedFields.push({
      name: fieldName,
      type: fieldDef.type || 'object',
      source: definition.name,
    });
  }

  const esFieldNames = new Set<string>();
  for (const [fieldName, fieldEntry] of Object.entries(fieldCapsResponse.fields)) {
    if (isMetadataField(fieldName) || overrideNames.has(fieldName)) continue;
    const esType = getFieldCapsType(
      fieldEntry as Record<string, { type: string; metadata_field?: boolean }>
    );
    if (!esType || esType === 'object' || esType === 'nested') continue;

    esFieldNames.add(fieldName);
    mappedFields.push({
      name: fieldName,
      type: esType,
      source: 'index_template',
      overridable: STREAMS_SUPPORTED_TYPES.has(esType),
    });
  }

  const allMappedNames = new Set([...overrideNames, ...esFieldNames]);
  const unmappedFields: string[] = [];
  for (const hit of sampleDocs.hits.hits) {
    if (!hit._source || typeof hit._source !== 'object') continue;
    const flat = flattenKeys(hit._source as Record<string, unknown>);
    for (const key of flat) {
      if (!allMappedNames.has(key) && !isMetadataField(key)) {
        allMappedNames.add(key);
        unmappedFields.push(key);
      }
    }
  }

  return { mappedFields, unmappedFields: unmappedFields.sort() };
};

const flattenKeys = (obj: Record<string, unknown>, prefix = ''): string[] => {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      keys.push(...flattenKeys(value as Record<string, unknown>, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
};
