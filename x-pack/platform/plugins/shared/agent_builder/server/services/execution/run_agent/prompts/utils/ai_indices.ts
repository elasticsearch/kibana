/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { cleanPrompt } from '@kbn/agent-builder-genai-utils/prompts';
import type { AiIndexCatalogEntry } from '../../types';

/**
 * Builds the AI INDICES prompt section from the resolved catalog. Empty when disabled or when
 * the catalog has no entries.
 */
export const getAiIndicesInstructions = ({
  enabled,
  catalog,
  spaceId,
}: {
  enabled: boolean;
  catalog: AiIndexCatalogEntry[];
  spaceId: string;
}): string => {
  if (!enabled || catalog.length === 0) {
    return '';
  }

  // Unresolved entries are omitted: the id is not a valid `FROM` target.
  const entries = catalog
    .filter(({ esqlTarget }) => esqlTarget !== undefined)
    .map(
      ({ id, esqlTarget, description }) =>
        `- \`${id}\` (FROM \`${esqlTarget}\`)${description ? ` — ${description}` : ''}`
    );
  const catalogSection =
    entries.length > 0 ? `Available to this agent:\n\n${entries.join('\n')}` : '';

  return cleanPrompt(`
## AI INDICES

An AI Index stores Knowledge Indicators (KIs): context prepared for agents, such as data descriptions, summaries, access patterns, queries, or records of Kibana resources. A KI may answer a question directly or help locate and use another source. AI Indices are Elasticsearch indices named \`ai-index-idx-*\`, or data streams named \`ai-index-ds-*\`.

Search relevant AI Indices before broader retrieval when their KIs may help. If they do not cover the question, continue with other relevant data or tools.

${catalogSection}

### Tools

Work with AI Indices through their dedicated tools, in this order:

1. \`list_ai_indices\` — the AI Indices available to you in this space, each with its id and the ES|QL target to put in \`FROM\`. Entries whose visibility probe fails, or whose documents all belong to other spaces, are omitted; empty or unresolved targets may remain listed. Skip it when the list above already names the index you need.
2. \`describe_ai_index\` — returns a context block for one index: what it holds, its fields, KI type and tag counts, and example ES|QL queries you can read and copy. Fields differ between AI Indices, so describe an index before filtering on one of its fields.
3. \`query_ai_indices\` — runs your ES|QL and returns the rows.

Do not query AI Indices with \`execute_esql\`: only \`query_ai_indices\` applies the space scoping below.

### Space scoping

This conversation runs in the space \`${spaceId}\`. Documents in an AI Index may belong to specific spaces. \`query_ai_indices\` applies that scoping server-side and returns only documents visible from this space. Never write a space condition in ES|QL: a filter you write does not replace the server's scoping, and can silently match nothing.
`);
};
