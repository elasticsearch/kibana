/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CompactionStructuredData } from '@kbn/agent-builder-common';

/**
 * Serializes CompactionStructuredData into a formatted text block
 * suitable for injection into the LLM prompt.
 */
export const serializeCompactionSummary = (data: CompactionStructuredData): string => {
  const parts: string[] = [];

  parts.push(`## Conversation Summary (compacted from previous rounds)`);
  parts.push(`**User Intent:** ${data.user_intent}`);
  parts.push(`**Discussion Summary:** ${data.discussion_summary}`);

  if (data.key_topics.length > 0) {
    parts.push(`**Key Topics:** ${data.key_topics.join(', ')}`);
  }

  if (data.entities.length > 0) {
    const entityLines = data.entities.map((e) => `- ${e.type}: ${e.name}`).join('\n');
    parts.push(`**Entities:**\n${entityLines}`);
  }

  if (data.tool_calls_summary.length > 0) {
    const toolLines = data.tool_calls_summary
      .map((tc) => `- [${tc.tool_id}] ${tc.params_summary}`)
      .join('\n');
    parts.push(`**Tool Call History:**\n${toolLines}`);
  }

  if (data.outcomes_and_decisions.length > 0) {
    const outcomeLines = data.outcomes_and_decisions.map((o) => `- ${o}`).join('\n');
    parts.push(`**Outcomes & Decisions:**\n${outcomeLines}`);
  }

  if (data.agent_actions.length > 0) {
    const actionLines = data.agent_actions.map((a) => `- ${a}`).join('\n');
    parts.push(`**Agent Actions:**\n${actionLines}`);
  }

  if (data.unanswered_questions.length > 0) {
    const questionLines = data.unanswered_questions.map((q) => `- ${q}`).join('\n');
    parts.push(`**Unanswered Questions:**\n${questionLines}`);
  }

  return parts.join('\n\n');
};
