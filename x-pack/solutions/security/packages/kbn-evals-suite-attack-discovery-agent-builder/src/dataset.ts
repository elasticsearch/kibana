/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  liveRetrievalFixture,
  missingAlertRetrievalFixture,
  multipleAlertSetsFixture,
  providedAlertFixture,
  statusOnlyFixture,
} from './fixtures';
import type { AttackDiscoveryAgentBuilderExample } from './types';

const fixtureAlertIds = [...providedAlertFixture.ids];

const expectedAttackDiscoveries = [
  {
    title: 'Defense Evasion and Credential Access on finance-ws-01',
    summaryMarkdown:
      'Encoded PowerShell execution and LSASS access on finance-ws-01 indicate a coordinated defense evasion and credential access chain.',
    detailsMarkdown:
      'Two alerts on finance-ws-01 — encoded PowerShell execution via powershell.exe and rundll32 accessing lsass.exe — suggest credential harvesting preceded by defense evasion.',
    entitySummaryMarkdown: 'Encoded PowerShell and LSASS access on finance-ws-01',
    mitreAttackTactics: ['Defense Evasion', 'Execution', 'Credential Access'],
    alertIds: fixtureAlertIds,
  },
];

const sharedCriteria = [
  'Insights mention encoded PowerShell execution or defense evasion.',
  'Insights mention LSASS, rundll32, or credential access.',
  'Insights reference the host finance-ws-01.',
  'Each insight includes non-empty title, summaryMarkdown, detailsMarkdown, and alertIds.',
  `The alertIds include both fixture IDs: ${fixtureAlertIds.join(' and ')}.`,
];

export const goldenPathExamples: AttackDiscoveryAgentBuilderExample[] = [
  {
    input: {
      question: providedAlertFixture.question,
      triageType: 'provided-alerts',
      expectedSkills: ['attack-discovery-generator'],
      expectedToolPath: ['security.attack-discovery.run'],
      attachments: [{ type: 'security.alerts', data: { alertIds: fixtureAlertIds } }],
    },
    output: {
      expectedToolPath: ['security.attack-discovery.run'],
      expectedWorkflowStages: ['generation', 'validation'],
      expectedRetrievedAlertCount: null,
      expectedPassedAlertCount: providedAlertFixture.alertCount,
      attackDiscoveries: expectedAttackDiscoveries,
      criteria: sharedCriteria,
    },
    metadata: {
      alertCount: providedAlertFixture.alertCount,
      fixture: 'provided-alerts',
      scenarioKey: 'provided-alerts',
    },
  },
  {
    input: {
      question: liveRetrievalFixture.question,
      triageType: 'live-retrieval',
      expectedSkills: ['attack-discovery-generator'],
      expectedToolPath: [
        'security.attack-discovery.get_default_esql_query',
        'platform.core.execute_esql',
        'security.attack-discovery.run',
      ],
    },
    output: {
      expectedToolPath: [
        'security.attack-discovery.get_default_esql_query',
        'platform.core.execute_esql',
        'security.attack-discovery.run',
      ],
      // When the agent retrieves alerts upstream and hands them to the AD
      // pipeline in `provided` mode, the audited pipeline skips its own
      // `alert_retrieval` stage and only records `generation` and `validation`.
      expectedWorkflowStages: ['generation', 'validation'],
      expectedRetrievedAlertCount: liveRetrievalFixture.alertCount,
      expectedPassedAlertCount: liveRetrievalFixture.alertCount,
      attackDiscoveries: expectedAttackDiscoveries,
      criteria: sharedCriteria,
    },
    metadata: {
      alertCount: liveRetrievalFixture.alertCount,
      fixture: 'live-retrieval',
      scenarioKey: 'live-retrieval',
    },
  },
  {
    input: {
      question: multipleAlertSetsFixture.question,
      triageType: 'multiple-alert-sets',
      expectedSkills: ['attack-discovery-generator'],
      expectedToolPath: ['security.attack-discovery.run'],
      attachments: [
        { type: 'security.alerts', data: { alertIds: [...multipleAlertSetsFixture.ids] } },
      ],
    },
    output: {
      expectedToolPath: ['security.attack-discovery.run'],
      expectedWorkflowStages: ['generation', 'validation'],
      expectedRetrievedAlertCount: null,
      expectedPassedAlertCount: multipleAlertSetsFixture.alertCount,
      attackDiscoveries: expectedAttackDiscoveries,
      criteria: sharedCriteria,
    },
    metadata: {
      alertCount: multipleAlertSetsFixture.alertCount,
      fixture: 'multiple-alert-sets',
      scenarioKey: 'multiple-alert-sets',
    },
  },
  {
    input: {
      question: missingAlertRetrievalFixture.question,
      triageType: 'live-retrieval',
      expectedSkills: ['attack-discovery-generator'],
      expectedToolPath: [
        'security.attack-discovery.get_default_esql_query',
        'platform.core.execute_esql',
      ],
    },
    output: {
      expectedToolPath: [
        'security.attack-discovery.get_default_esql_query',
        'platform.core.execute_esql',
      ],
      expectedWorkflowStages: [],
      expectedRetrievedAlertCount: null,
      expectedPassedAlertCount: null,
    },
    metadata: {
      alertCount: missingAlertRetrievalFixture.alertCount,
      fixture: 'missing-alert-retrieval',
      scenarioKey: 'missing-alert-retrieval',
    },
  },
  {
    input: {
      question: statusOnlyFixture.question,
      triageType: 'status-only',
      expectedSkills: ['attack-discovery-generator'],
      expectedToolPath: ['security.attack-discovery.get_status'],
      executionUuid: statusOnlyFixture.executionUuid,
    },
    output: {
      expectedToolPath: ['security.attack-discovery.get_status'],
      expectedWorkflowStages: [],
      expectedRetrievedAlertCount: null,
      expectedPassedAlertCount: null,
    },
    metadata: {
      alertCount: statusOnlyFixture.alertCount,
      fixture: 'status-only',
      scenarioKey: 'status-only',
    },
  },
];
