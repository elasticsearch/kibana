/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout-security';
import { evaluate } from '../../src/evaluate';
import { padJobIds, lmdJobIds } from '../../src/ml_helpers';

/**
 * Entity Store V2 - multi-skill routing evals.
 *
 * These specs validate that cross-domain prompts correctly route to MULTIPLE
 * tools when Entity Store V2 is enabled: combinations of security.get_entity /
 * security.search_entities with find.security.ml.jobs.
 *
 * Tool routing assertions work without pre-seeded data; the tools may return
 * "entity not found" or "no anomalies" but they MUST both be called.
 */
evaluate.describe(
  'SIEM Entity Analytics V2 Skill - Multi-Skill Routing',
  { tag: tags.serverless.security.complete },
  () => {
    evaluate('entity store v2: multi-skill routing questions', async ({ evaluateDataset }) => {
      await evaluateDataset({
        dataset: {
          name: 'entity-analytics-v2: multi-skill routing',
          description:
            'Cross-domain prompts requiring both entity store V2 tools and ML jobs in a single response',
          examples: [
            {
              input: {
                question:
                  'Show me the risk profile for user Cielo39 and any anomalous behavior detected',
              },
              output: {
                criteria: [
                  'Retrieve Cielo39 entity profile AND check for anomalous behavior using ML jobs.',
                  'Do not fabricate entity or anomaly data.',
                ],
                toolCalls: [
                  {
                    id: 'security.get_entity',
                    criteria: [
                      'The tool is called with an entityId matching "Cielo39" or equivalent.',
                    ],
                  },
                  {
                    id: 'find.security.ml.jobs',
                    criteria: [
                      'The response uses find.security.ml.jobs to check for anomalous behavior related to the user.',
                    ],
                  },
                ],
                tool_sequence: ['security.get_entity', 'find.security.ml.jobs'],
              },
              metadata: { query_intent: 'Factual' },
            },
            {
              input: {
                question: 'Which high-risk entities also have anomalous login patterns?',
              },
              output: {
                criteria: [
                  'Use entity search to find high-risk entities AND ML jobs to detect anomalous login patterns.',
                  'Do not fabricate entity or anomaly data.',
                ],
                toolCalls: [
                  {
                    id: 'security.search_entities',
                    criteria: [
                      'The tool is called with parameters that filter or sort by risk score or risk level.',
                    ],
                  },
                  {
                    id: 'find.security.ml.jobs',
                    criteria: [
                      'The response uses find.security.ml.jobs to detect anomalous login patterns via security auth or related ML jobs.',
                    ],
                  },
                ],
                tool_sequence: ['security.search_entities', 'find.security.ml.jobs'],
              },
              metadata: { query_intent: 'Factual' },
            },
            {
              input: {
                question: 'Find business-critical hosts with unusual lateral movement activity',
              },
              output: {
                criteria: [
                  'Use entity search to find business-critical hosts AND ML jobs to detect lateral movement anomalies.',
                  'Do not fabricate entity or anomaly data.',
                ],
                toolCalls: [
                  {
                    id: 'security.search_entities',
                    criteria: [
                      'The tool is called with entityTypes containing "host" and criticalityLevels containing "high_impact" and/or "extreme_impact".',
                    ],
                  },
                  {
                    id: 'find.security.ml.jobs',
                    criteria: [
                      `The response uses find.security.ml.jobs with LMD job IDs (e.g. ${lmdJobIds
                        .slice(0, 2)
                        .join(
                          ', '
                        )}), or explains that ML jobs are needed for lateral movement detection.`,
                    ],
                  },
                ],
                tool_sequence: ['security.search_entities', 'find.security.ml.jobs'],
              },
              metadata: { query_intent: 'Factual' },
            },
            {
              input: {
                question:
                  'Show me privileged users on watchlists who also have anomalous administrative actions',
              },
              output: {
                criteria: [
                  'Use entity search to find watchlisted privileged users AND ML jobs to detect anomalous administrative actions.',
                  'Do not fabricate entity or anomaly data.',
                ],
                toolCalls: [
                  {
                    id: 'security.search_entities',
                    criteria: [
                      'The tool is called with a watchlists parameter or equivalent to find privileged users.',
                    ],
                  },
                  {
                    id: 'find.security.ml.jobs',
                    criteria: [
                      `The response uses find.security.ml.jobs with PAD job IDs (e.g. ${padJobIds
                        .slice(0, 2)
                        .join(
                          ', '
                        )}), or explains that ML jobs are needed for anomalous admin action detection.`,
                    ],
                  },
                ],
                tool_sequence: ['security.search_entities', 'find.security.ml.jobs'],
              },
              metadata: { query_intent: 'Factual' },
            },
          ],
        },
      });
    });
  }
);
