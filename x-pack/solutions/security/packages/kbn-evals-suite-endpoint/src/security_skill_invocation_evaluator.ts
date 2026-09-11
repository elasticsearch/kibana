/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client as EsClient } from '@elastic/elasticsearch';
import { createTraceBasedEvaluator, TRACE_INDEX_PATTERN, type Evaluator } from '@kbn/evals';
import type { ToolingLog } from '@kbn/tooling-log';

const VALID_SKILL_NAME = /^[a-zA-Z0-9_-]+$/;

export function createSecuritySkillInvocationEvaluator({
  traceEsClient,
  log,
  skillName,
}: {
  traceEsClient: EsClient;
  log: ToolingLog;
  skillName: string;
}): Evaluator {
  if (!VALID_SKILL_NAME.test(skillName)) {
    throw new Error(
      `Invalid skillName: "${skillName}" - only alphanumeric characters, hyphens, and underscores are allowed`
    );
  }

  return createTraceBasedEvaluator({
    traceEsClient,
    log,
    config: {
      name: `Skill Invoked (${skillName})`,
      direction: 'maximize',
      buildQuery: (traceId) => `FROM ${TRACE_INDEX_PATTERN}
| WHERE trace.id == "${traceId}"
| STATS
  total_spans = COUNT(*),
  skill_invoked = COUNT(
    CASE(
      (
        attributes.gen_ai.tool.name == "filestore.read"
          AND attributes.gen_ai.tool.call.arguments LIKE "*/${skillName}/SKILL.md*"
      )
      OR (
        attributes.gen_ai.tool.name == "load_skill"
          AND attributes.gen_ai.tool.call.arguments LIKE "*${skillName}*"
      ),
      1,
      NULL
    )
  )`,
      extractResult: (response) => {
        const row = response.values[0];
        const totalSpansIndex = response.columns.findIndex(
          (column) => column.name === 'total_spans'
        );
        const skillInvokedIndex = response.columns.findIndex(
          (column) => column.name === 'skill_invoked'
        );

        if (totalSpansIndex === -1 || skillInvokedIndex === -1) {
          log.warning('Expected columns not found in trace query response');
          return null;
        }

        const totalSpans = row?.[totalSpansIndex] as number | undefined;
        const skillInvoked = row?.[skillInvokedIndex] as number | undefined;

        if (!totalSpans) {
          return null;
        }

        return (skillInvoked ?? 0) > 0 ? 1 : 0;
      },
      isResultValid: (result) => result !== null,
    },
  });
}
