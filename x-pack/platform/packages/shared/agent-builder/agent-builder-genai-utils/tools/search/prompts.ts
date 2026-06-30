/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BaseMessageLike } from '@langchain/core/messages';
import { cleanPrompt } from '../../prompts';
import type { ResourceDescriptor } from '../index_explorer';
import { formatResource } from '../index_explorer';

import {
  naturalLanguageSearchToolName as nlTool,
  noMatchingResourceToolName as noMatchTool,
  relevanceSearchToolName as relevanceTool,
} from './inner_tools';

export const getSearchDispatcherPrompt = ({
  nlQuery,
  resources,
  customInstructions,
}: {
  nlQuery: string;
  resources: ResourceDescriptor[];
  customInstructions?: string;
}): BaseMessageLike[] => {
  const resourceListing = resources.map(formatResource).join('\n');

  const systemPrompt =
    cleanPrompt(`You are a search dispatcher. Your ONLY task is to call the appropriate search tool with the correct parameters.

## CRITICAL INSTRUCTIONS

- You MUST call exactly ONE tool. Do NOT respond with text.
- Do NOT ask clarifying questions. Make your best judgment.
- The \`index\` parameter MUST be the name of one of the available resources listed below.
- Call \`${noMatchTool}\` only when no listed resource can plausibly answer the query.

## Tool Selection Guidance

### '${relevanceTool}' (full-text search)
Use when the target resource has text or semantic_text fields AND the query is about finding content by topic, concept, or matching unstructured text.
Examples: "find information about our Q3 earnings report", "search for documents mentioning 'data privacy'"

### '${nlTool}' (structured/analytical search)
Use for filtering by specific values, aggregations, calculations, sorting, counting, entity lookups by ID, or any structured data analysis. If the resource's field metadata explicitly shows it has no text or semantic_text fields, always use this tool. If field metadata is missing or unknown (e.g. for aliases), use your best judgment based on the query intent.
Examples: "what is the average order value?", "find the customer with ID 914255", "how many errors were logged in the past hour?"

IMPORTANT: Resources of type \`dataset\` are external ES|QL datasets that can ONLY be queried with ES|QL. You MUST use '${nlTool}' for them — never '${relevanceTool}', which does not support datasets.

### '${noMatchTool}' (escape hatch)
Use ONLY when none of the listed resources can plausibly answer the query. Call with no arguments.

${customInstructions ? `## Additional Instructions\n\n${customInstructions}\n` : ''}
## Available Resources

<available_resources>
${resourceListing}
</available_resources>
`);

  const userPrompt = `Execute the following user query: "${nlQuery}"

Call exactly ONE tool now. Select the most relevant resource as the index and the appropriate search strategy.`;

  return [
    ['system', systemPrompt],
    ['user', userPrompt],
  ];
};
