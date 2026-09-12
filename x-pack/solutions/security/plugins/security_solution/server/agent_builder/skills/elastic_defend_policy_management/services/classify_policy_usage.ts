/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EndpointCountResult } from './count_endpoints';

export type PolicyUsageClassification = 'used' | 'unused' | 'undetermined';

export type ClassifiedPolicyUsage = Readonly<{
  classification: PolicyUsageClassification;
  reason?: string;
  enrolled?: number;
}>;

export const classifyPolicyUsage = (result: EndpointCountResult): ClassifiedPolicyUsage => {
  if (result.source === 'no_agent_policy_assignments') {
    return { classification: 'unused', reason: 'no_agent_policy_assignments' };
  }

  const total = result.status.all;
  if (typeof total !== 'number') {
    return { classification: 'undetermined', reason: 'no_enrolled_total' };
  }
  if (total > 0) {
    return { classification: 'used', enrolled: total };
  }
  return { classification: 'unused', enrolled: 0 };
};
