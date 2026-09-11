/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PrebuiltRuleFixture } from './types';

/**
 * Prebuilt rules referenced by Splunk `prebuilt_match` fixtures in
 * `datasets/rules/splunk/splunk_rules.ts`. Looked up from a running Kibana via
 * `GET /api/saved_objects/_find?type=security-rule` on 2026-08-20.
 * `name`/`description` are copied verbatim so semantic/keyword search behaves the same as
 * against the real installed asset.
 */
export const splunkPrebuiltRules: PrebuiltRuleFixture[] = [
  {
    // splunk-prebuilt-match-001
    ruleId: '8cb84371-d053-4f4f-bce0-c74990e28f28',
    name: 'Potential Successful SSH Brute Force Attack',
    description:
      'Identifies multiple SSH login failures followed by a successful one from the same source address. Adversaries can attempt to login into multiple users with a common or known password to gain access to accounts.',
  },
  {
    // splunk-prebuilt-match-002
    ruleId: 'aff74d85-5bfa-4ff1-ace2-4e3995a37cfa',
    name: 'Google Workspace Impossible Travel Login',
    description:
      'Detects successful Google Workspace sign-ins for the same user from two geographically separated locations within a 90-minute window, where the implied travel speed between the two points exceeds what is physically possible (>=800 km/h, faster than modern commercial airliners) and the geographic separation is at least 500 km. This pattern indicates either VPN/proxy use or an adversary signing in to a compromised account from a different location than the legitimate user.',
    mitreAttackIds: ['T1078', 'T1078.004', 'T1528', 'T1557'],
  },
];
