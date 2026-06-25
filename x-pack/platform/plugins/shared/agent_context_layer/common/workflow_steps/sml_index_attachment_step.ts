/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { i18n } from '@kbn/i18n';
import { StepCategory } from '@kbn/workflows';
import type { CommonStepDefinition } from '@kbn/workflows-extensions/common';

/**
 * Workflow step type id for the "Add Context Engine entry" step.
 *
 * The id is product-named (`contextEngine.*`) rather than plugin-named
 * (`agentContextLayer.*`) because "Context Engine" is the user-facing brand
 * for this surface — workflow authors should not have to know about the
 * implementing plugin.
 *
 * We deliberately avoid the `kibana.*` prefix: the workflow execution engine
 * routes any `kibana.*` step type through the HTTP-based Kibana action
 * resolver, which expects a registered Kibana API connector. This step
 * dispatches in-process to the Agent Context Layer start contract instead,
 * matching the namespace convention used by other extension steps that ship
 * their own dispatcher (e.g. cases plugin: `cases.getCase`).
 */
export const ContextEngineAddEntryStepTypeId = 'contextEngine.addEntry';

// Per-field upper bounds. Values are conservative: identifier-like fields
// stay well below the 32 KB Elasticsearch keyword limit, and `content` /
// `description` (indexed as `semantic_text`) cap at 50 KB / 8 KB — already
// far past the ~512-token window the embedding model truncates to. These
// bounds exist primarily to harden the public input surface against
// pathological payloads (CodeQL DoS rule), not to reflect storage limits.
const MAX_SML_IDENTIFIER_LENGTH = 256;
const MAX_SML_TITLE_LENGTH = 1024;
const MAX_SML_DESCRIPTION_LENGTH = 8192;
const MAX_SML_CONTENT_LENGTH = 50_000;
const MAX_SML_REFERENCES = 100;
const MAX_SML_PERMISSIONS = 100;
const MAX_SML_TAGS = 100;
const MAX_SML_TAG_LENGTH = 100;
const MAX_SML_ES_INDICES = 100;

const ChunkSchema = z.object({
  type: z
    .string()
    .min(1)
    .max(MAX_SML_IDENTIFIER_LENGTH)
    .describe('Chunk type (e.g., "visualization", "dashboard").'),
  title: z.string().min(1).max(MAX_SML_TITLE_LENGTH).describe('Display title for the chunk.'),
  content: z
    .string()
    .min(1)
    .max(MAX_SML_CONTENT_LENGTH)
    .describe('Searchable content (indexed as semantic_text).'),
  description: z
    .string()
    .max(MAX_SML_DESCRIPTION_LENGTH)
    .optional()
    .describe('Optional longer summary indexed as semantic_text.'),
  user_id: z
    .string()
    .max(MAX_SML_IDENTIFIER_LENGTH)
    .optional()
    .describe('Optional owner/last-modifier user id.'),
  references: z
    .array(z.string().max(MAX_SML_IDENTIFIER_LENGTH))
    .max(MAX_SML_REFERENCES)
    .optional()
    .describe('Optional list of referenced SML chunk ids.'),
  permissions: z
    .array(z.string().max(MAX_SML_IDENTIFIER_LENGTH))
    .max(MAX_SML_PERMISSIONS)
    .optional()
    .describe('Optional Kibana privilege strings required to view the chunk later.'),
  tags: z
    .array(
      z
        .string()
        .max(MAX_SML_TAG_LENGTH)
        .regex(
          /^[a-z0-9][a-z0-9_-]*$/,
          'Tag must be lowercase alphanumeric and may contain hyphens or underscores (e.g. "otel", "my-tag", "v2_data").'
        )
    )
    .max(MAX_SML_TAGS)
    .optional()
    .describe(
      'Optional tags for grouping and retrieval. Must be lowercase alphanumeric; hyphens and underscores are allowed (e.g. ["otel", "my-tag"]). Tags are matched with OR semantics on the list endpoint.'
    ),
  elasticsearchIndices: z
    .array(z.string().max(MAX_SML_IDENTIFIER_LENGTH))
    .max(MAX_SML_ES_INDICES)
    .optional()
    .describe(
      'Optional Elasticsearch index / alias / data-stream names whose data this chunk depends on. Viewers must hold the ES `read` privilege on every listed name to see the chunk at search time.'
    ),
});

/**
 * Step input.
 *
 * Workflow-driven writes always go through the content-mode path on the SML
 * start contract — caller-supplied chunks are written as
 * `ingestion_method: 'manual'`.
 *
 * - `upsert` requires `chunks` and always performs a full replace: every
 *   prior chunk for the `origin_id` is removed and the supplied chunks are
 *   written. There is no fail-if-exists / fail-if-not-found distinction —
 *   the indexer's content-mode path is idempotent by design, so we expose
 *   a single `upsert` action rather than the misleading `create`/`update`
 *   pair.
 * - `delete` requires only the origin/type identifiers and wipes every
 *   chunk recorded for the `origin_id` regardless of how it was produced
 *   (both crawled and manual entries). This matches the "workflow owns
 *   this origin" semantic and is the opposite of the crawler's default
 *   delete (which preserves curated manual entries).
 */
export const SmlIndexAttachmentInputSchema = z.discriminatedUnion('action', [
  z.object({
    originId: z
      .string()
      .min(1)
      .max(MAX_SML_IDENTIFIER_LENGTH)
      .describe('Stable identifier for the source object (e.g., saved object id).'),
    attachmentType: z
      .string()
      .min(1)
      .max(MAX_SML_IDENTIFIER_LENGTH)
      .describe('Context Engine entry type id (chunk namespace).'),
    action: z.literal('upsert'),
    chunks: z.array(ChunkSchema).min(1).max(100),
  }),
  z.object({
    originId: z.string().min(1).max(MAX_SML_IDENTIFIER_LENGTH),
    attachmentType: z.string().min(1).max(MAX_SML_IDENTIFIER_LENGTH),
    action: z.literal('delete'),
  }),
]);

export const SmlIndexAttachmentOutputSchema = z.object({
  originId: z.string().max(MAX_SML_IDENTIFIER_LENGTH),
  attachmentType: z.string().max(MAX_SML_IDENTIFIER_LENGTH),
  action: z.enum(['upsert', 'delete']),
  spaceId: z.string().max(MAX_SML_IDENTIFIER_LENGTH),
  /**
   * Number of chunks the workflow asked the step to index. Reflects the
   * caller-supplied `chunks.length` (0 for `delete`), not the count of
   * documents Elasticsearch confirms it has written. Per-document bulk
   * failures are logged by the indexer but do not throw — if you need a
   * confirmed-write count, validate downstream.
   */
  requestedChunkCount: z.number().int().nonnegative(),
  acknowledged: z.literal(true),
});

export type SmlIndexAttachmentStepInputSchema = typeof SmlIndexAttachmentInputSchema;
export type SmlIndexAttachmentStepOutputSchema = typeof SmlIndexAttachmentOutputSchema;

export const contextEngineAddEntryStepCommonDefinition: CommonStepDefinition<
  SmlIndexAttachmentStepInputSchema,
  SmlIndexAttachmentStepOutputSchema
> = {
  id: ContextEngineAddEntryStepTypeId,
  category: StepCategory.Kibana,
  // Marks this step as Technical Preview in the workflow UI / step list so
  // workflow authors know the contract may change before GA.
  stability: 'tech_preview',
  label: i18n.translate('xpack.agentContextLayer.workflowSteps.contextEngineAddEntry.label', {
    defaultMessage: 'Add Context Engine entry',
  }),
  description: i18n.translate(
    'xpack.agentContextLayer.workflowSteps.contextEngineAddEntry.description',
    {
      defaultMessage:
        'Add or remove an entry in the Context Engine (Agent Context Layer) using caller-supplied chunks.',
    }
  ),
  documentation: {
    details: i18n.translate(
      'xpack.agentContextLayer.workflowSteps.contextEngineAddEntry.documentation.details',
      {
        defaultMessage:
          "Writes chunks directly (the registered type\u2019s `getSmlData` hook is not invoked). `upsert` writes the supplied `chunks` tagged `ingestion_method: 'manual'`, replacing any prior chunks for the `origin_id` (idempotent — no fail-if-exists / fail-if-not-found distinction). `delete` wipes every chunk for the `origin_id` regardless of how it was produced.",
      }
    ),
    examples: [
      `## Add a custom summary entry
\`\`\`yaml
- name: add_summary_entry
  type: ${ContextEngineAddEntryStepTypeId}
  with:
    originId: "doc-42"
    attachmentType: "custom"
    action: "upsert"
    chunks:
      - type: "custom"
        title: "Quarterly summary"
        content: "Revenue grew 12% across all regions ..."
        description: "Auto-generated quarterly summary"
\`\`\``,

      `## Remove a previously added entry
\`\`\`yaml
- name: remove_entry
  type: ${ContextEngineAddEntryStepTypeId}
  with:
    originId: "doc-42"
    attachmentType: "custom"
    action: "delete"
\`\`\``,
    ],
  },
  inputSchema: SmlIndexAttachmentInputSchema,
  outputSchema: SmlIndexAttachmentOutputSchema,
};
