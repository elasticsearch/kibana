/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ValidatedBehavior } from './hunt_behavior';
import { toIndexedBehaviors } from './indexed_behaviors';

const sampleValidatedBehavior = (): ValidatedBehavior => ({
  technique_id: 'T1059.003',
  evidence_quote: 'PowerShell was used to download a payload.',
  llm_confidence: 0.9,
  confidence: 0.9,
  technique_name: 'Windows Command Shell',
  reference: 'https://attack.mitre.org/techniques/T1059/003/',
  tactic_ids: ['TA0002'],
  proposed_esql_rule: 'FROM logs-* | WHERE ...',
  rule_name: 'Threat Intel — T1059.003',
  severity: 'medium',
  risk_score: 47,
  finding_id: 'report-1:T1059.003',
});

describe('toIndexedBehaviors', () => {
  it('projects only fields allowed by the threat-reports index mapping', () => {
    expect(toIndexedBehaviors([sampleValidatedBehavior()])).toEqual([
      {
        id: 'report-1:T1059.003',
        technique_id: 'T1059.003',
        description: 'PowerShell was used to download a payload.',
        llm_confidence: 0.9,
        confidence: 0.9,
      },
    ]);
  });

  it('drops hunt_behavior-only enrichment fields', () => {
    const [indexed] = toIndexedBehaviors([sampleValidatedBehavior()]);
    expect(indexed).not.toHaveProperty('proposed_esql_rule');
    expect(indexed).not.toHaveProperty('behavior_type');
    expect(indexed).not.toHaveProperty('evidence_quote');
  });
});
