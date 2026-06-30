/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  TOOL_ID_EXECUTE_ESQL,
  TOOL_ID_KI_SEARCH,
  extractToolCallIds,
} from '../../utils/tool_usage';
import type { InvestigatorEvaluator } from '../../types';

export const createInvestigatorToolUsageEvaluator = (): InvestigatorEvaluator => ({
  name: 'trajectory',
  kind: 'CODE',
  evaluate: ({ input, output }) => {
    const detections = output.inputDetections ?? input.detections ?? [];

    const calledTools = new Set(extractToolCallIds(output.steps ?? []));
    const calledKiSearch = calledTools.has(TOOL_ID_KI_SEARCH);
    const calledEsql = calledTools.has(TOOL_ID_EXECUTE_ESQL);

    // Empty batch — agent should return immediately with no tool calls.
    if (detections.length === 0) {
      const unexpectedCalls = calledTools.size;
      return Promise.resolve({
        score: unexpectedCalls === 0 ? 1 : 0,
        label: unexpectedCalls === 0 ? 'correct' : 'unexpected-tools',
        explanation:
          unexpectedCalls === 0
            ? 'Empty batch: no tool calls made as expected'
            : `Empty batch: agent made ${unexpectedCalls} unexpected tool call(s) instead of early-exiting`,
      });
    }

    const allQuiet = detections.every((d) => d.kind === 'quiet');

    if (allQuiet) {
      // All-quiet batch: KI search runs (to populate cause_kis / dependency context), but
      // execute_esql must NOT run — quiet rules carry no confirmation queries.
      if (!calledKiSearch && !calledEsql) {
        return Promise.resolve({
          score: 0,
          label: 'missing-tools',
          explanation:
            'All-quiet batch: search_knowledge_indicators was not called — required to populate cause_kis and dependency context even for quiet rules',
        });
      }
      if (!calledKiSearch) {
        return Promise.resolve({
          score: 0,
          label: 'missing-ki-search',
          explanation:
            'All-quiet batch: search_knowledge_indicators was not called; KI search is mandatory first regardless of rule kind',
        });
      }
      if (calledEsql) {
        return Promise.resolve({
          score: 0.5,
          label: 'unnecessary-esql',
          explanation:
            'All-quiet batch: search_knowledge_indicators called correctly but execute_esql was also called — quiet rules must not trigger confirmation queries (the detection pipeline quiet signal is authoritative)',
        });
      }
      return Promise.resolve({
        score: 1,
        label: 'correct',
        explanation:
          'All-quiet batch: correctly called search_knowledge_indicators only — execute_esql skipped as required for quiet rules',
      });
    }

    const expected = [TOOL_ID_KI_SEARCH, TOOL_ID_EXECUTE_ESQL];
    const missing = expected.filter((t) => !calledTools.has(t));
    const score = (expected.length - missing.length) / expected.length;

    return Promise.resolve({
      score,
      label: score === 1 ? 'correct' : 'missing-tools',
      explanation:
        score === 1 ? 'Correctly called all tools' : `Missing tools: ${missing.join(', ')}`,
    });
  },
});
