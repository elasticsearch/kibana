/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PrebuiltRuleFixture } from './types';

/**
 * Prebuilt rules referenced by QRadar `prebuilt_match` fixtures in
 * `datasets/rules/qradar/qradar_rules.ts`. Looked up from a running Kibana via
 * `GET /api/saved_objects/_find?type=security-rule` on 2026-08-20.
 * `name`/`description` are copied verbatim so semantic/keyword search behaves the same as
 * against the real installed asset.
 */
export const qradarPrebuiltRules: PrebuiltRuleFixture[] = [
  {
    // qradar-prebuilt-match-001
    ruleId: 'e08ccd49-0380-4b2b-8d71-8000377d6e49',
    name: 'Attempts to Brute Force an Okta User Account',
    description:
      'Identifies when an Okta user account is locked out 3 times within a 3 hour window. An adversary may attempt a brute force or password spraying attack to obtain unauthorized access to user accounts. The default Okta authentication policy ensures that a user account is locked out after 10 failed authentication attempts.',
  },
  {
    // qradar-prebuilt-match-002
    ruleId: 'bc9f5144-0ead-476e-ba6e-cef295601195',
    name: 'Microsoft Entra ID Impossible Travel Sign-in',
    description:
      'Detects successful Microsoft Entra ID interactive sign-ins for the same user from two geographically separated locations within a 90-minute window, where the implied travel speed between the two points exceeds what is physically possible (>=800 km/h, faster than modern commercial airliners) and the geographic separation is at least 500 km. This pattern indicates either VPN/proxy use or an adversary signing in to a compromised account from a different location than the legitimate user. Non-interactive sign-in categories are excluded because backend token refresh activity routinely egresses through cloud regions unrelated to the user. This activity is often observed from AiTM phishing kits or successful phishing campaigns.',
    mitreAttackIds: ['T1078', 'T1078.004', 'T1528', 'T1557'],
  },
  {
    // qradar-prebuilt-match-003
    ruleId: 'b240bfb8-26b7-4e5e-924e-218144a3fa71',
    name: 'Spike in Network Traffic',
    description:
      'A machine learning job detected an unusually large spike in network traffic. Such a burst of traffic, if not caused by a surge in business activity, can be due to suspicious or malicious activity. Large-scale data exfiltration may produce a burst of network traffic; this could also be due to unusually large amounts of reconnaissance or enumeration traffic. Denial-of-service attacks or traffic floods may also produce such a surge in traffic.',
    mitreAttackIds: ['T1041', 'T1046', 'T1498', 'T1595'],
  },
];
