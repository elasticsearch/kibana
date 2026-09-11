/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import type { InferenceClient } from '@kbn/inference-common';
import {
  CORTEX_ENTITY_TYPES,
  type CortexEntityType,
  type CortexPageStatus,
  type CortexPageSummary,
} from '../../common/cortex';
import type { CortexPageStore } from './page_store';
import { canonicalizeSlug, slugFromCortexId, toCortexKiId } from './page_store';

const MAX_TRANSCRIPT_CHARS = 12_000;
const MAX_PROPOSALS = 8;

export interface CortexEditProposal {
  action: 'upsert' | 'corroborate' | 'archive';
  entity_type: CortexEntityType;
  slug: string;
  title: string;
  description?: string;
  content?: string;
  status?: Exclude<CortexPageStatus, 'archived'>;
}

export type ProposeCortexEdits = (input: {
  transcript: string;
  catalog: CortexPageSummary[];
}) => Promise<{ edits: CortexEditProposal[] }>;

const isEntityType = (value: unknown): value is CortexEntityType =>
  typeof value === 'string' && (CORTEX_ENTITY_TYPES as readonly string[]).includes(value);

const isAction = (value: unknown): value is CortexEditProposal['action'] =>
  value === 'upsert' || value === 'corroborate' || value === 'archive';

const normalizeSlug = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

const normalizeTitle = (title: string): string =>
  title
    .toLowerCase()
    .replace(/^(alert|postmortem|runbook|topic|service)\s*:\s*/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const resolveSlug = (edit: CortexEditProposal, catalog: CortexPageSummary[]): string => {
  const canonical = canonicalizeSlug(edit.entity_type, edit.slug);
  const canonicalId = toCortexKiId(edit.entity_type, canonical);
  if (catalog.some((page) => page.id === canonicalId)) {
    return canonical;
  }

  const titleKey = normalizeTitle(edit.title);
  const match = catalog.find(
    (page) => page.entity_type === edit.entity_type && normalizeTitle(page.title) === titleKey
  );
  if (match) {
    return canonicalizeSlug(match.entity_type, slugFromCortexId(match.id, match.entity_type));
  }

  return canonical;
};

const normalizeProposal = (value: unknown): CortexEditProposal | undefined => {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (!isAction(record.action) || !isEntityType(record.entity_type)) {
    return undefined;
  }
  if (typeof record.slug !== 'string' || typeof record.title !== 'string') {
    return undefined;
  }
  const slug = normalizeSlug(record.slug);
  if (slug.length === 0) {
    return undefined;
  }

  const status =
    record.status === 'established' || record.status === 'tentative' ? record.status : undefined;

  return {
    action: record.action,
    entity_type: record.entity_type,
    slug,
    title: record.title.slice(0, 512),
    ...(typeof record.description === 'string'
      ? { description: record.description.slice(0, 2048) }
      : {}),
    ...(typeof record.content === 'string' ? { content: record.content.slice(0, 65536) } : {}),
    ...(status !== undefined ? { status } : {}),
  };
};

export const createLlmProposeCortexEdits = ({
  inferenceClient,
  connectorId,
}: {
  inferenceClient: InferenceClient;
  connectorId: string;
}): ProposeCortexEdits => {
  return async ({ transcript, catalog }) => {
    const catalogLines =
      catalog.length === 0
        ? '(empty)'
        : catalog
            .map((page) => {
              const slug = canonicalizeSlug(
                page.entity_type,
                slugFromCortexId(page.id, page.entity_type)
              );
              return `- slug=${slug} | ${page.entity_type} | ${page.status} | ${page.title} (${page.corroborations}x)`;
            })
            .join('\n');

    const response = await inferenceClient.output({
      id: 'nightshift_cortex_optimize',
      connectorId,
      system: `You maintain a team-wide wiki called Cortex. After an investigation, propose a small set of durable page edits.

Rules:
- Only propose facts that the transcript actually established. No speculation.
- Prefer corroborating an existing page over creating a near-duplicate.
- New pages use action "upsert" with markdown content. Keep content short and reusable.
- Use "corroborate" when the investigation confirms an existing page without changing it.
- Use "archive" only when the transcript shows a page is wrong or obsolete.
- entity_type must be one of: ${CORTEX_ENTITY_TYPES.join(', ')}.
- slug is a short kebab-case identifier. Reuse an existing page's slug exactly. Never prefix slug with "cortex", the entity type, or a document id.
- Propose at most ${MAX_PROPOSALS} edits. Return an empty list if nothing durable was learned.`,
      input: `Existing pages:\n${catalogLines}\n\nInvestigation transcript:\n${transcript}`,
      schema: {
        type: 'object',
        properties: {
          edits: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                action: { type: 'string', enum: ['upsert', 'corroborate', 'archive'] },
                entity_type: { type: 'string', enum: [...CORTEX_ENTITY_TYPES] },
                slug: { type: 'string' },
                title: { type: 'string' },
                description: { type: 'string' },
                content: { type: 'string' },
                status: { type: 'string', enum: ['established', 'tentative'] },
              },
              required: ['action', 'entity_type', 'slug', 'title'],
            },
          },
        },
        required: ['edits'],
      },
    });

    const rawEdits = Array.isArray(response.output?.edits) ? response.output.edits : [];
    return {
      edits: rawEdits
        .map(normalizeProposal)
        .filter((edit): edit is CortexEditProposal => edit !== undefined)
        .slice(0, MAX_PROPOSALS),
    };
  };
};

export const applyCortexEdits = async ({
  store,
  edits,
  logger,
}: {
  store: CortexPageStore;
  edits: CortexEditProposal[];
  logger: Logger;
}): Promise<void> => {
  const { pages } = await store.list();
  for (const edit of edits) {
    const slug = resolveSlug(edit, pages);
    const id = toCortexKiId(edit.entity_type, slug);
    if (edit.action === 'corroborate') {
      const updated = await store.corroborate(id);
      if (updated) {
        logger.info(`Corroborated Cortex page ${id}`);
      }
      continue;
    }

    if (edit.action === 'archive') {
      const updated = await store.archive(id);
      if (updated) {
        logger.info(`Archived Cortex page ${id}`);
      }
      continue;
    }

    const existing = await store.get(id);
    await store.upsert({
      entityType: edit.entity_type,
      slug,
      title: edit.title,
      description: edit.description ?? existing?.description,
      content: edit.content ?? existing?.content ?? '',
      status: edit.status ?? existing?.status ?? 'tentative',
      corroborations: existing?.corroborations,
    });
    logger.info(`Upserted Cortex page ${id}`);
  }
};

export const optimizeCortex = async ({
  store,
  proposeEdits,
  userMessage,
  assistantMessage,
  logger,
}: {
  store: CortexPageStore;
  proposeEdits: ProposeCortexEdits;
  userMessage: string;
  assistantMessage: string;
  logger: Logger;
}): Promise<void> => {
  await store.pruneDuplicates();
  const { pages } = await store.list();
  const transcript = [
    '## User',
    userMessage.slice(0, MAX_TRANSCRIPT_CHARS),
    '',
    '## Assistant',
    assistantMessage.slice(0, MAX_TRANSCRIPT_CHARS),
  ].join('\n');

  const { edits } = await proposeEdits({ transcript, catalog: pages });
  if (edits.length === 0) {
    logger.debug('Cortex optimizer proposed no edits');
    return;
  }

  await applyCortexEdits({ store, edits, logger });
};
