/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout';
import { evaluate } from '../src/evaluate';
import { createEvaluateDataset } from '../src/evaluate_dataset';
import { sampleRules } from '../datasets/sample_rules';
import { hardCases } from '../datasets/hard_cases';
import { standardPairs } from '../datasets/standard_pairs';
import { complexPairs } from '../datasets/complex_pairs';
import { negativePairs } from '../datasets/negative_pairs';

evaluate.describe('AI Rule Generation', { tag: tags.serverless.security.complete }, () => {
  evaluate(
    'generates accurate detection rules',
    async ({
      executorClient,
      evaluators,
      chatClient,
      evaluationInferenceClient,
      traceEsClient,
      log,
    }) => {
      const evaluateDataset = createEvaluateDataset({
        evaluators,
        executorClient,
        chatClient,
        inferenceClient: evaluationInferenceClient,
        traceEsClient,
        log,
      });

      const allRules = [...sampleRules, ...standardPairs, ...complexPairs];
      log.info(`Running AI rule generation evaluation with ${allRules.length} examples`);
      await evaluateDataset({
        dataset: {
          name: 'security-ai-rules: rule-generation-basic',
          description:
            'Evaluates AI-generated detection rules against known examples from elastic/detection-rules',
          examples: allRules.map((rule) => ({
            id: rule.id,
            input: { prompt: rule.prompt },
            output: rule,
            metadata: { category: rule.category, difficulty: 'medium', expectedName: rule.name },
          })),
        },
      });
      log.info('AI rule generation evaluation complete');
    }
  );

  evaluate(
    'handles edge cases and errors gracefully',
    async ({
      executorClient,
      evaluators,
      chatClient,
      evaluationInferenceClient,
      traceEsClient,
      log,
    }) => {
      const usableCases = hardCases.filter(
        (c) => c.metadata.difficulty !== 'very-hard' // too slow / rate-limited for CI
      );

      if (usableCases.length === 0) {
        log.info('No usable edge cases to evaluate — skipping');
        return;
      }

      const evaluateDataset = createEvaluateDataset({
        evaluators,
        executorClient,
        chatClient,
        inferenceClient: evaluationInferenceClient,
        traceEsClient,
        log,
      });

      log.info(`Running edge case evaluation with ${usableCases.length} examples`);
      await evaluateDataset({
        dataset: {
          name: 'security-ai-rules: edge-cases',
          description: 'Tests AI rule generation with edge cases and challenging prompts',
          examples: usableCases.map((c) => ({
            id: c.id,
            input: { prompt: c.prompt },
            output: c.output,
            metadata: c.metadata,
          })),
        },
      });
      log.info('Edge case evaluation complete');
    }
  );

  evaluate(
    'rejects impossible detection requests',
    async ({
      executorClient,
      evaluators,
      chatClient,
      evaluationInferenceClient,
      traceEsClient,
      log,
    }) => {
      const evaluateDataset = createEvaluateDataset({
        evaluators,
        executorClient,
        chatClient,
        inferenceClient: evaluationInferenceClient,
        traceEsClient,
        log,
      });

      log.info(`Running negative case evaluation with ${negativePairs.length} examples`);
      await evaluateDataset({
        dataset: {
          name: 'security-ai-rules: negative-cases',
          description:
            'Prompts that should NOT produce a valid rule given the stated available data',
          examples: negativePairs.map((pair) => ({
            id: pair.id,
            input: { prompt: `${pair.prompt}\n\nAvailable data: ${pair.availableData}` },
            output: {
              id: pair.id,
              name: '',
              description: '',
              query: '',
              threat: [],
              severity: 'low' as const,
              tags: [],
              riskScore: 0,
              from: 'now-5m',
              category: 'negative',
              prompt: pair.prompt,
            },
            metadata: pair.metadata,
          })),
        },
      });
      log.info('Negative case evaluation complete');
    }
  );
});
