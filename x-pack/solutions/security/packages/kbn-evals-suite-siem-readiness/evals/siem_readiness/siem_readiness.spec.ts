/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout';
import { evaluate } from '../../src/evaluate';
import {
  SIEM_READINESS_INDICES,
  SIEM_READINESS_PIPELINE_NAME,
  cleanupSiemReadinessData,
  seedSiemReadinessData,
} from '../../src/data_generators/siem_readiness_data';

const createdRuleIds: string[] = [];

evaluate.describe('SIEM Readiness', { tag: tags.stateful.classic }, () => {
  evaluate.beforeAll(async ({ internalEsClient, chatClient, fetch, log, uiSettings }) => {
    await uiSettings.set({ 'agentBuilder:experimentalFeatures': true });
    await seedSiemReadinessData({ esClient: internalEsClient, log });

    // Create detection rules for blast-radius testing
    // Rule 1: maps to endpoint index, MITRE Initial Access
    const rule1 = (await fetch('/api/detection_engine/rules', {
      method: 'POST',
      version: '2023-10-31',
      body: JSON.stringify({
        name: 'Eval Rule - Endpoint Process',
        description: 'SIEM readiness eval rule for endpoint process events',
        risk_score: 47,
        severity: 'medium',
        type: 'query',
        language: 'kuery',
        query: 'event.category: process',
        index: [SIEM_READINESS_INDICES.endpoint],
        enabled: true,
        threat: [
          {
            framework: 'MITRE ATT&CK',
            tactic: {
              id: 'TA0001',
              name: 'Initial Access',
              reference: 'https://attack.mitre.org/tactics/TA0001/',
            },
            technique: [],
          },
        ],
      }),
    })) as unknown as { id: string };
    createdRuleIds.push(rule1.id);

    // Rule 2: maps to identity index, MITRE Credential Access
    const rule2 = (await fetch('/api/detection_engine/rules', {
      method: 'POST',
      version: '2023-10-31',
      body: JSON.stringify({
        name: 'Eval Rule - Identity Auth',
        description: 'SIEM readiness eval rule for identity authentication events',
        risk_score: 47,
        severity: 'medium',
        type: 'query',
        language: 'kuery',
        query: 'event.category: authentication',
        index: [SIEM_READINESS_INDICES.identity],
        enabled: true,
        threat: [
          {
            framework: 'MITRE ATT&CK',
            tactic: {
              id: 'TA0006',
              name: 'Credential Access',
              reference: 'https://attack.mitre.org/tactics/TA0006/',
            },
            technique: [],
          },
        ],
      }),
    })) as unknown as { id: string };
    createdRuleIds.push(rule2.id);

    // Warmup
    try {
      await chatClient.converse({ message: 'hello' });
    } catch (e) {
      log.warning(`Warmup failed: ${e}`);
    }
  });

  evaluate.afterAll(async ({ internalEsClient, fetch, log, uiSettings }) => {
    await uiSettings.unset('agentBuilder:experimentalFeatures');
    await cleanupSiemReadinessData({ esClient: internalEsClient, log });
    const idsToDelete = createdRuleIds.splice(0);
    if (idsToDelete.length > 0) {
      try {
        await fetch('/api/detection_engine/rules/_bulk_action', {
          method: 'POST',
          version: '2023-10-31',
          body: JSON.stringify({ ids: idsToDelete, action: 'delete' }),
        });
      } catch (e) {
        log.warning(`Failed to delete eval detection rules: ${e}`);
      }
    }
  });

  // ---------------------------------------------------------------------------
  // Scenario 1: Full readiness report
  // ---------------------------------------------------------------------------
  evaluate('full readiness report across all dimensions', async ({ evaluateDataset }) => {
    await evaluateDataset({
      dataset: {
        name: 'siem-readiness: full report',
        description:
          'Validates the agent produces a full SIEM readiness posture report covering all ' +
          'four dimensions (coverage, quality, continuity, retention). Expected flow: ' +
          'calls get_coverage, get_quality, get_continuity, get_retention (or at minimum ' +
          'get_coverage). Response contains Status, Summary, Findings, and Suggested Actions sections. ' +
          'Overall status is actionsRequired (not healthy or noData) since there are known issues seeded.',
        examples: [
          {
            input: {
              question: 'What is my SIEM readiness status?',
            },
            output: {
              criteria: [
                'Called all 4 SIEM readiness tools (get_coverage, get_quality, get_continuity, get_retention) or at minimum called get_coverage.',
                'Response contains a Status section showing overall health.',
                'Response contains a Summary section.',
                'Response contains a Findings section with at least one finding.',
                'Response contains a Suggested Actions section.',
                'The overall status is actionsRequired (not healthy or noData) since there are known issues seeded.',
              ],
            },
          },
        ],
      },
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 2: Coverage — missing Application/SaaS
  // ---------------------------------------------------------------------------
  evaluate('coverage analysis identifies missing Application/SaaS', async ({ evaluateDataset }) => {
    await evaluateDataset({
      dataset: {
        name: 'siem-readiness: coverage missing Application/SaaS',
        description:
          'Validates the agent detects that Application/SaaS category has no ingested data. ' +
          'Expected: Response identifies missing Application/SaaS, confirms Endpoint, Identity, ' +
          'Network, and Cloud categories have data. Finding includes Affected Platform, ' +
          'Affected Rules, and Affected Tactics sub-bullets.',
        examples: [
          {
            input: {
              question: 'What is my data coverage across SIEM categories?',
            },
            output: {
              criteria: [
                'Called the get_coverage tool.',
                'The response identifies that Application/SaaS category has no ingested data or is missing.',
                'The response confirms Endpoint, Identity, Network, and Cloud categories have data.',
                'The Application/SaaS finding includes Affected Platform, Affected Rules, and Affected Tactics sub-bullets.',
              ],
            },
          },
        ],
      },
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 3: Quality — ECS incompatibility detected
  // ---------------------------------------------------------------------------
  evaluate('quality analysis detects ECS incompatibility', async ({ evaluateDataset }) => {
    await evaluateDataset({
      dataset: {
        name: 'siem-readiness: quality ECS incompatibility',
        description:
          'Validates the agent detects that the identity index has incompatible ECS fields. ' +
          'Expected: Response identifies incompatible ECS fields in identity index, ' +
          'states endpoint index has no incompatible fields (healthy). Finding includes ' +
          'Affected Platform, Affected Rules, and Affected Tactics sub-bullets. ' +
          'Did not fabricate ECS issues for indices with 0 incompatible fields.',
        examples: [
          {
            input: {
              question: 'How is my data quality? Are there any ECS compatibility issues?',
            },
            output: {
              criteria: [
                'Called the get_quality tool.',
                `The response identifies that the identity index (${SIEM_READINESS_INDICES.identity}) has incompatible ECS fields.`,
                'The response states the endpoint index has no incompatible fields (healthy).',
                'The quality finding includes Affected Platform, Affected Rules, and Affected Tactics sub-bullets.',
                'Did not fabricate ECS issues for indices with 0 incompatible fields.',
              ],
            },
          },
        ],
      },
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 4: Continuity — critical pipeline failure
  // ---------------------------------------------------------------------------
  evaluate('continuity analysis detects critical pipeline failure', async ({ evaluateDataset }) => {
    await evaluateDataset({
      dataset: {
        name: 'siem-readiness: continuity critical pipeline failure',
        description:
          'Validates the agent detects a critical ingest pipeline failure. ' +
          'Expected: Response identifies the failing pipeline with critical failure rate, ' +
          'does NOT report the healthy pipeline as failing. Finding includes Affected Platform, ' +
          'Affected Rules, and Affected Tactics sub-bullets and is labeled as critical or actionRequired.',
        examples: [
          {
            input: {
              question: 'Check my ingest pipeline health.',
            },
            output: {
              criteria: [
                'Called the get_continuity tool.',
                `The response identifies the failing pipeline (${SIEM_READINESS_PIPELINE_NAME}) as having a critical failure rate.`,
                'The response does NOT report the healthy pipeline as failing.',
                'The pipeline finding includes Affected Platform, Affected Rules, and Affected Tactics sub-bullets.',
                'The pipeline finding is labeled as critical or actionRequired.',
              ],
            },
          },
        ],
      },
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 5: Retention — below FedRAMP threshold
  // ---------------------------------------------------------------------------
  evaluate('retention analysis flags non-compliant data streams', async ({ evaluateDataset }) => {
    await evaluateDataset({
      dataset: {
        name: 'siem-readiness: retention FedRAMP non-compliance',
        description:
          'Validates the agent detects data retention compliance status. ' +
          'Expected: Response flags short-retention data stream as non-compliant (below 365 days), ' +
          'confirms long-retention data stream (400d) is compliant. Non-compliant finding includes ' +
          'Affected Platform, Affected Rules, and Affected Tactics sub-bullets. ' +
          'Does not flag the compliant data stream as a problem.',
        examples: [
          {
            input: {
              question:
                'What is my data retention compliance status? Are my data streams meeting the 365-day FedRAMP requirement?',
            },
            output: {
              criteria: [
                'Called the get_retention tool.',
                'The response flags the short-retention data stream as non-compliant (below 365 days).',
                'The response confirms the long-retention data stream (400d) is compliant.',
                'The non-compliant finding includes Affected Platform, Affected Rules, and Affected Tactics sub-bullets.',
                'Does not flag the compliant data stream as a problem.',
              ],
            },
          },
        ],
      },
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 6: Blast radius accuracy
  // ---------------------------------------------------------------------------
  evaluate(
    'blast radius findings show accurate rule and tactic mapping',
    async ({ evaluateDataset }) => {
      await evaluateDataset({
        dataset: {
          name: 'siem-readiness: blast radius accuracy',
          description:
            'Validates the agent produces accurate blast radius impacts showing which rules ' +
            'and tactics are affected by SIEM readiness issues. Expected: For at least one finding, ' +
            'Affected Rules field lists a seeded rule name and Affected Tactics includes a seeded tactic. ' +
            'Blast-radius fields appear as explicit labeled sub-bullets. ' +
            'blastRadiusStatus is not "unavailable (lookup failed)" for indexed categories.',
          examples: [
            {
              input: {
                question: 'What are the blast radius impacts of my SIEM readiness issues?',
              },
              output: {
                criteria: [
                  'Called at least one SIEM readiness tool.',
                  'For at least one finding, the Affected Rules field lists "Eval Rule - Endpoint Process" or "Eval Rule - Identity Auth" (the seeded rules).',
                  'For at least one finding, the Affected Tactics field includes "Initial Access" or "Credential Access" (the seeded tactics).',
                  'The blast-radius fields (Affected Platform, Affected Rules, Affected Tactics) are shown as explicit labeled sub-bullets under the finding, not embedded in prose.',
                  'blastRadiusStatus is not shown as "unavailable (lookup failed)" for indexed categories (endpoint, identity, network, cloud have data and rules).',
                ],
              },
            },
          ],
        },
      });
    }
  );

  // ---------------------------------------------------------------------------
  // Scenario 7: Dimension-scoped question
  // ---------------------------------------------------------------------------
  evaluate('dimension-scoped question focuses on single dimension', async ({ evaluateDataset }) => {
    await evaluateDataset({
      dataset: {
        name: 'siem-readiness: dimension-scoped continuity',
        description:
          'Validates the agent scopes the response to a single dimension when asked specifically. ' +
          'Expected: Calls only get_continuity tool, focuses on pipeline/continuity health, ' +
          'does NOT call all 4 tools unnecessarily. Identifies the failing pipeline. ' +
          'Other dimensions are omitted or noted as "not evaluated for this query".',
        examples: [
          {
            input: {
              question: 'How are my ingest pipelines doing? Just check pipeline health.',
            },
            output: {
              criteria: [
                'Called the get_continuity tool.',
                'The response focuses on pipeline/continuity health.',
                'The response does NOT call all 4 tools unnecessarily — the response should be about pipeline health specifically.',
                'The failing pipeline is identified.',
                'Other dimensions (Coverage, Quality, Retention) are either omitted or noted as "not evaluated for this query".',
              ],
            },
          },
        ],
      },
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 8: noData scenario
  // ---------------------------------------------------------------------------
  evaluate('noData scenario handles missing data gracefully', async ({ evaluateDataset }) => {
    await evaluateDataset({
      dataset: {
        name: 'siem-readiness: noData for non-existent index',
        description:
          'Validates the agent handles missing data gracefully when checking an index with no data. ' +
          'Expected: Calls get_quality tool, acknowledges no data quality results found, ' +
          'does NOT fabricate quality findings. Overall quality status is noData or indicates no results available.',
        examples: [
          {
            input: {
              question:
                'Check my data quality for the index logs-nonexistent-for-siem-readiness-eval.',
            },
            output: {
              criteria: [
                'Called the get_quality tool.',
                'The response acknowledges that no data quality check results were found for the specified index or that quality check results are unavailable.',
                'The response does NOT fabricate quality findings or invent incompatible fields.',
                'The overall quality status is noData or indicates no results available.',
              ],
            },
          },
        ],
      },
    });
  });

  // ---------------------------------------------------------------------------
  // Scenario 9: Four-section format compliance
  // ---------------------------------------------------------------------------
  evaluate('four-section format compliance', async ({ evaluateDataset }) => {
    await evaluateDataset({
      dataset: {
        name: 'siem-readiness: four-section format',
        description:
          'Validates the agent produces a report with the required four sections in the correct order: ' +
          'Status → Summary → Findings → Suggested Actions. Each finding includes Affected Platform, ' +
          'Affected Rules, and Affected Tactics as sub-items (not in prose).',
        examples: [
          {
            input: {
              question: 'Give me a full SIEM readiness report.',
            },
            output: {
              criteria: [
                'The response contains a Status section (or clearly shows an overall health verdict at the top).',
                'The response contains a Summary section with at least one sentence about the current state.',
                'The response contains a Findings section with at least one finding from the seeded data (coverage, quality, continuity, or retention finding).',
                'The response contains a Suggested Actions section with at least one actionable recommendation.',
                'The sections appear in the order: Status → Summary → Findings → Suggested Actions (or equivalent top-down structure).',
                'Each finding in the Findings section has Affected Platform, Affected Rules, and Affected Tactics shown as sub-items (not in prose).',
              ],
            },
          },
        ],
      },
    });
  });
});
