/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { i18n } from '@kbn/i18n';
import type { IUiSettingsClient } from '@kbn/core/server';
import { ToolType } from '@kbn/agent-builder-common';
import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';
import type { BuiltinToolDefinition } from '@kbn/agent-builder-server';
import type { ToolHandlerReturn } from '@kbn/agent-builder-server/tools/handler';
import type {
  Streams,
  IngestStreamLifecycle,
  FailureStore,
  FieldDefinitionConfig,
  ClassicFieldDefinition,
} from '@kbn/streams-schema';
import { OBSERVABILITY_STREAMS_ENABLE_QUERY_STREAMS } from '@kbn/management-settings-ids';
import dedent from 'dedent';
import type { GetScopedClients } from '../../../routes/types';
import type { StreamsClient } from '../../../lib/streams/client';
import type { AttachmentClient } from '../../../lib/streams/attachments/attachment_client';
import { patchIngestAndUpsert } from '../../../lib/streams/helpers/ingest_upsert';
import { upsertQueryStream } from '../../../lib/streams/helpers/query_upsert';
import {
  STREAMS_UPDATE_STREAM_TOOL_ID as UPDATE_STREAM,
  STREAMS_DESIGN_PIPELINE_TOOL_ID as DESIGN_PIPELINE,
  STREAMS_INSPECT_STREAMS_TOOL_ID as INSPECT_STREAMS,
} from '../tool_ids';
import { classifyError } from '../../utils/error_utils';
import { getConfirmationMessage } from './confirmation_helpers';
import { validateProcessingJson } from '../../utils/format_validation_errors';
import { type StreamsWriteQueue, abortSignalFromRequest } from '../../utils/write_queue';

const stepSchema = z
  .record(z.string(), z.unknown())
  .describe(
    'A Streamlang step object from the design pipeline or inspect streams tool. Pass through as-is — do not construct manually.'
  );

const lifecycleSchema = z.object({
  type: z
    .enum(['inherit', 'dsl', 'ilm'])
    .describe(
      '"inherit" from parent (wired only), "dsl" for data retention period, "ilm" for ILM policy'
    ),
  data_retention: z
    .string()
    .optional()
    .describe('For "dsl" only: retention period, e.g. "30d", "90d", "1y". Omit for unlimited.'),
  ilm_policy: z
    .string()
    .optional()
    .describe(
      'For "ilm" only: ILM policy name. Use list_ilm_policies to discover available policies.'
    ),
});

const fieldsSchema = z
  .record(
    z.string(),
    z.object({
      type: z
        .string()
        .describe(
          'Field type: keyword, match_only_text, long, double, date, boolean, ip, geo_point, system'
        ),
    })
  )
  .describe('Map of field names to definitions. Example: {"response_time":{"type":"long"}}');

const failureStoreSchema = z.object({
  type: z
    .enum(['inherit', 'disabled', 'enabled', 'enabled_no_lifecycle'])
    .describe(
      '"inherit" from parent, "disabled", "enabled" with retention, or "enabled_no_lifecycle"'
    ),
  data_retention: z
    .string()
    .optional()
    .describe('For "enabled" only: retention period for failed documents, e.g. "30d".'),
});

const queryStreamSchema = z.object({
  esql: z
    .string()
    .describe(
      'The ES|QL query that defines this query stream. Must include a FROM clause. For a child query stream (e.g. "logs.ecs.errors"), the FROM clause must reference the parent stream or its ES|QL view. Example: \'FROM logs.ecs | WHERE log.level == "error"\''
    ),
  field_descriptions: z
    .record(z.string(), z.string())
    .optional()
    .describe(
      'Optional map of field name -> human-readable description for fields the query produces. Example: {"error.message":"The human-readable error text"}'
    ),
});

const updateStreamSchema = z.object({
  name: z.string().describe('Exact stream name, e.g. "logs.ecs.nginx"'),
  changes: z
    .object({
      processing: z
        .array(stepSchema)
        .optional()
        .describe(
          'The complete processing pipeline as an array of step objects. Replaces the entire pipeline. Use the design pipeline tool to construct new steps. To remove a step, omit it. To reorder, change the array order.'
        ),
      description: z.string().optional().describe('Updated stream description'),
      lifecycle: lifecycleSchema.optional(),
      fields: fieldsSchema.optional(),
      failure_store: failureStoreSchema.optional(),
      query: queryStreamSchema
        .optional()
        .describe(
          'Create or update a query stream (a read-only ES|QL view). If the named stream does not exist it is created as a query stream; if it already exists as a query stream its ES|QL is updated. Mutually exclusive with processing, lifecycle, fields, and failure_store — query streams have no ingest configuration. May be combined with changes.description.'
        ),
    })
    .describe(
      'All modifications go INSIDE this object. For processing changes, set changes.processing = [steps]. For lifecycle changes, set changes.lifecycle = {...}. To create or update a query stream, set changes.query = {esql, ...}. Never put processing or other change keys at the top level — they will be ignored.'
    ),
  confirmation_body: z
    .string()
    .optional()
    .describe(
      'Markdown text displayed in the user-facing confirmation dialog. Summarize what will change (current → proposed) and any impact. This is NOT an instruction — it does not drive the change. The actual changes go in the `changes` object.'
    ),
});

export const createUpdateStreamTool = ({
  getScopedClients,
  writeQueue,
}: {
  getScopedClients: GetScopedClients;
  writeQueue: StreamsWriteQueue;
}): BuiltinToolDefinition<typeof updateStreamSchema> => ({
  id: UPDATE_STREAM,
  type: ToolType.builtin,
  description: dedent(`
    Applies changes to a stream's configuration. This tool MUTATES state.

    **Intent gate:** Only call this tool when the user has given a direct, explicit instruction
    to apply changes — e.g. "fix it", "apply it", "go ahead", "do it", "yes". Questions like
    "how can we fix this?", "what would you suggest?", or "what's the best approach?" are NOT
    instructions — they are requests for analysis. For those, use ${DESIGN_PIPELINE} to
    investigate and present findings, then stop and wait for the user to confirm.

    **Cancellation:** If this tool returns "The user chose not to proceed with this action",
    acknowledge the cancellation for this specific operation. Do NOT retry the same operation
    with different parameters. You may continue with other unrelated operations the user
    requested, or ask how they want to proceed.

    **Processing:** Set changes.processing to the complete pipeline array. The array replaces the entire pipeline.
    - Use ${DESIGN_PIPELINE} to design new or modified steps. To remove a step, omit it from the array. To reorder, change the array order.
    - Get the current pipeline from ${INSPECT_STREAMS} (aspects: ["processing"]) or from a ${DESIGN_PIPELINE} result.
    - Never construct step objects manually — only use objects from ${DESIGN_PIPELINE} or ${INSPECT_STREAMS}.
    - The steps MUST go in changes.processing, not as a top-level parameter.

    **Other changes:**
    - description: Update stream description
    - lifecycle: Set retention (inherit, dsl with data_retention, or ilm with policy name)
    - fields: Map fields with type definitions (e.g. {"response_time":{"type":"long"}})
    - failure_store: Configure failure store (inherit, disabled, enabled with retention)

    **Query streams:** Set changes.query = {esql, field_descriptions?} to create or update a query stream (a read-only ES|QL view).
    - If the named stream does not exist, it is created as a query stream. If it already exists as a query stream, its ES|QL is updated.
    - changes.query is mutually exclusive with processing, lifecycle, fields, and failure_store — query streams have no ingest configuration. It may be combined with changes.description.
    - For a child query stream, the esql FROM clause must reference the parent stream (or its ES|QL view). Use ${INSPECT_STREAMS} on the parent first if unsure of the source.
  `),
  tags: ['streams'],
  schema: updateStreamSchema,
  confirmation: {
    askUser: 'always',
    getConfirmation: ({ toolParams }) => ({
      title: toolParams.changes?.query
        ? i18n.translate('xpack.streams.agentBuilder.tools.updateStream.confirmQueryStreamTitle', {
            defaultMessage: 'Create or update query stream "{name}"',
            values: { name: toolParams.name },
          })
        : i18n.translate('xpack.streams.agentBuilder.tools.updateStream.confirmTitle', {
            defaultMessage: 'Update stream "{name}"',
            values: { name: toolParams.name },
          }),
      message: getConfirmationMessage(toolParams, 'confirmation_body'),
      confirm_text: i18n.translate(
        'xpack.streams.agentBuilder.tools.updateStream.confirmButtonLabel',
        { defaultMessage: 'Apply changes' }
      ),
      color: 'primary' as const,
    }),
  },
  handler: async ({ name, changes }, { request }) => {
    const signal = abortSignalFromRequest(request);
    try {
      const { streamsClient, attachmentClient, uiSettingsClient } = await getScopedClients({
        request,
      });

      if (changes.query) {
        return await handleQueryStreamChange({
          name,
          query: changes.query,
          otherChanges: changes,
          streamsClient,
          attachmentClient,
          uiSettingsClient,
          writeQueue,
          signal,
        });
      }

      if (changes.processing) {
        const validation = validateProcessingJson({ steps: changes.processing });
        if (!validation.success) {
          return {
            results: [
              {
                type: ToolResultType.error,
                data: {
                  message: `Invalid processing steps: ${validation.error}`,
                  stream: name,
                  operation: 'update_stream',
                  likely_cause:
                    'The processing steps contain invalid or malformed step objects. Use the design pipeline tool to produce valid steps.',
                },
              },
            ],
          };
        }
      }

      const hasChanges =
        changes.processing ||
        changes.lifecycle ||
        changes.fields ||
        changes.failure_store ||
        changes.description !== undefined;

      const appliedChanges = await writeQueue.enqueue(async () => {
        if (!hasChanges) return [];

        const applied: string[] = [];

        await patchIngestAndUpsert({
          streamsClient,
          attachmentClient,
          name,
          patchFn: (definition) => {
            let updatedIngest = { ...definition.ingest };

            if (changes.processing) {
              updatedIngest = {
                ...updatedIngest,
                processing: {
                  ...updatedIngest.processing,
                  steps:
                    changes.processing as unknown as Streams.ingest.all.Definition['ingest']['processing']['steps'],
                },
              };
              applied.push('processing');
            }

            if (changes.lifecycle) {
              updatedIngest = {
                ...updatedIngest,
                lifecycle: toIngestLifecycle(changes.lifecycle),
              };
              applied.push('lifecycle');
            }

            if (changes.failure_store) {
              updatedIngest = {
                ...updatedIngest,
                failure_store: toFailureStoreConfig(changes.failure_store),
              };
              applied.push('failure_store');
            }

            if (changes.fields) {
              updatedIngest = applyFieldChanges(
                updatedIngest,
                changes.fields as Record<string, { type: string }>
              );
              applied.push('fields');
            }

            if (changes.description !== undefined) {
              applied.push('description');
            }

            return {
              ingest: updatedIngest,
              ...(changes.description !== undefined && { description: changes.description }),
            };
          },
        });

        return applied;
      }, signal);

      let note: string;
      if (appliedChanges.length === 0) {
        note =
          'No changes were applied — the changes object was empty. Verify that processing steps, lifecycle, fields, or other changes are inside the `changes` parameter (not at the top level).';
      } else if (appliedChanges.includes('processing')) {
        note =
          'Processing changes applied and take effect for newly ingested documents. Pre-existing errors remain in the failure store. Do NOT auto-verify — report the result to the user and stop. If the user asks to verify later, diagnose and compare last_seen to applied_at.';
      } else {
        note = 'Changes applied successfully.';
      }

      return {
        results: [
          {
            type: ToolResultType.other,
            data: {
              success: appliedChanges.length > 0,
              stream: name,
              applied_changes: appliedChanges,
              applied_at: new Date().toISOString(),
              note,
            },
          },
        ],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        results: [
          {
            type: ToolResultType.error,
            data: {
              message: `Failed to update stream "${name}": ${message}`,
              stream: name,
              operation: 'update_stream',
              likely_cause: classifyError(err),
            },
          },
        ],
      };
    }
  },
});

type UpdateStreamChanges = z.infer<typeof updateStreamSchema>['changes'];

/**
 * Creates or updates a query stream. Query streams are read-only ES|QL views with no ingest
 * configuration, so this path is distinct from the ingest patch flow: it rejects combinations
 * with ingest-only change types, enforces the query streams feature flag, and delegates the
 * create/update to the shared `upsertQueryStream` helper (also used by the REST route).
 */
const handleQueryStreamChange = async ({
  name,
  query,
  otherChanges,
  streamsClient,
  attachmentClient,
  uiSettingsClient,
  writeQueue,
  signal,
}: {
  name: string;
  query: NonNullable<UpdateStreamChanges['query']>;
  otherChanges: UpdateStreamChanges;
  streamsClient: StreamsClient;
  attachmentClient: AttachmentClient;
  uiSettingsClient: IUiSettingsClient;
  writeQueue: StreamsWriteQueue;
  signal: AbortSignal;
}): Promise<ToolHandlerReturn> => {
  const conflictingKeys = [
    otherChanges.processing && 'processing',
    otherChanges.lifecycle && 'lifecycle',
    otherChanges.fields && 'fields',
    otherChanges.failure_store && 'failure_store',
  ].filter((key): key is string => Boolean(key));

  if (conflictingKeys.length > 0) {
    return {
      results: [
        {
          type: ToolResultType.error,
          data: {
            message: `Query streams are defined only by an ES|QL query. Remove ${conflictingKeys.join(
              ', '
            )} from changes — query streams have no processing, lifecycle, fields, or failure store.`,
            stream: name,
            operation: 'update_stream',
            likely_cause: 'changes.query was combined with ingest-stream change types.',
          },
        },
      ],
    };
  }

  const queryStreamsEnabled = await uiSettingsClient.get<boolean>(
    OBSERVABILITY_STREAMS_ENABLE_QUERY_STREAMS
  );
  if (!queryStreamsEnabled) {
    return {
      results: [
        {
          type: ToolResultType.error,
          data: {
            message: 'Query streams are not enabled on this deployment, so they cannot be created.',
            stream: name,
            operation: 'update_stream',
            likely_cause:
              'The "observability:streamsEnableQueryStreams" advanced setting is disabled.',
          },
        },
      ],
    };
  }

  const { esql, field_descriptions: fieldDescriptions } = query;
  const description = otherChanges.description;

  const upsertResult = await writeQueue.enqueue(
    () =>
      upsertQueryStream({
        streamsClient,
        attachmentClient,
        name,
        esql,
        fieldDescriptions,
        description,
      }),
    signal
  );

  const appliedChanges = ['query', ...(description !== undefined ? ['description'] : [])];

  return {
    results: [
      {
        type: ToolResultType.other,
        data: {
          success: true,
          stream: name,
          stream_type: 'query',
          applied_changes: appliedChanges,
          applied_at: new Date().toISOString(),
          result: upsertResult.result,
          note:
            upsertResult.result === 'created'
              ? 'Query stream created. It is a read-only ES|QL view — query its data with the query documents tool.'
              : 'Query stream updated. The ES|QL view now reflects the new query.',
        },
      },
    ],
  };
};

const toIngestLifecycle = (input: z.infer<typeof lifecycleSchema>): IngestStreamLifecycle => {
  switch (input.type) {
    case 'inherit':
      return { inherit: {} };
    case 'dsl':
      return { dsl: { data_retention: input.data_retention || undefined } };
    case 'ilm':
      return { ilm: { policy: input.ilm_policy ?? '' } };
  }
};

const toFailureStoreConfig = (input: z.infer<typeof failureStoreSchema>): FailureStore => {
  switch (input.type) {
    case 'inherit':
      return { inherit: {} };
    case 'disabled':
      return { disabled: {} };
    case 'enabled':
      return { lifecycle: { enabled: { data_retention: input.data_retention || undefined } } };
    case 'enabled_no_lifecycle':
      return { lifecycle: { disabled: {} } };
  }
};

const applyFieldChanges = (
  ingest: Streams.ingest.all.Definition['ingest'],
  fields: Record<string, { type: string }>
): Streams.ingest.all.Definition['ingest'] => {
  if ('wired' in ingest) {
    const wiredIngest = ingest as Streams.WiredStream.Definition['ingest'];
    return {
      ...wiredIngest,
      wired: {
        ...wiredIngest.wired,
        fields: {
          ...wiredIngest.wired.fields,
          ...(fields as unknown as Record<string, FieldDefinitionConfig>),
        },
      },
    };
  }

  if ('classic' in ingest) {
    const classicIngest = ingest as Streams.ClassicStream.Definition['ingest'];
    return {
      ...classicIngest,
      classic: {
        ...classicIngest.classic,
        field_overrides: {
          ...classicIngest.classic.field_overrides,
          ...(fields as unknown as ClassicFieldDefinition),
        },
      },
    };
  }

  throw new Error('Field mapping is only supported on wired and classic streams.');
};
