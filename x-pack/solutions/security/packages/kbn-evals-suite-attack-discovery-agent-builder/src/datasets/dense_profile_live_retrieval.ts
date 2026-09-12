/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { AD2_CLEAN_SCENARIO_KEYS } from '../scenario_registry';
import { AD2_DENSE_TARGET_ALERTS } from '../scenario_registry/dense_scenarios';
import type { AttackDiscoveryAgentBuilderExample } from '../types';

/**
 * Dense-profile live retrieval.
 *
 * The clean-profile datasets hand the model four alert IDs and ask it to
 * triage them. That measures write-up quality, not detection: the correlation
 * work is already done by the fixture.
 *
 * Here the model retrieves from an index holding AD2_DENSE_TARGET_ALERTS
 * alerts, of which only the four clean chains are real. Finding them is the
 * task. This is the volume-sensitive measurement the clean profile cannot make.
 */
export const denseProfileLiveRetrievalExample: AttackDiscoveryAgentBuilderExample = {
  input: {
    question:
      'Run Attack Discovery over the alerts currently in the environment and return the validated discoveries.',
    triageType: 'live-retrieval',
    expectedSkills: ['attack-discovery-generator'],
    expectedToolPath: ['security.attack-discovery.run'],
  },
  output: {
    expectedToolPath: ['security.attack-discovery.run'],
    expectedWorkflowStages: ['generation', 'validation'],
    // The model retrieves the whole seeded population.
    expectedRetrievedAlertCount: AD2_DENSE_TARGET_ALERTS,
    // Deliberately null: how many alerts SHOULD survive triage is a judgement,
    // and pinning a number here would score correlation behaviour against an
    // assumption rather than against evidence.
    expectedPassedAlertCount: null,
    criteria: [
      'The response identifies attack chains rather than restating individual alerts.',
      'Discoveries are grounded in alerts that exist in the retrieved set.',
      'Background noise (isolated logon failures, share enumeration, cron edits) is not promoted into a discovery on its own.',
    ],
  },
  metadata: {
    alertCount: AD2_DENSE_TARGET_ALERTS,
    fixture: 'live-retrieval',
    scenarioKey: 'dense-profile-live-retrieval',
    seedProfile: 'dense',
  },
};

export const denseProfileLiveRetrievalDataset = {
  name: 'attack-discovery-agent-builder: scenario-registry (dense profile)',
  description: `Live-retrieval Attack Discovery over a ${AD2_DENSE_TARGET_ALERTS}-alert seeded population containing ${AD2_CLEAN_SCENARIO_KEYS.length} real attack chains and synthetic background noise.`,
  examples: [denseProfileLiveRetrievalExample],
};
