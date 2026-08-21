/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EndpointCountResult } from './count_endpoints';
import { classifyPolicyUsage } from './classify_policy_usage';

const countResult = (
  overrides: Partial<EndpointCountResult> & Pick<EndpointCountResult, 'source'>
): EndpointCountResult => ({
  population: 'enrolled_agents',
  status: {},
  ...overrides,
});

describe('classifyPolicyUsage', () => {
  it('classifies no agent-policy assignments as unused', () => {
    expect(
      classifyPolicyUsage(
        countResult({
          source: 'no_agent_policy_assignments',
          status: { all: 9 },
        })
      )
    ).toEqual({
      classification: 'unused',
      reason: 'no_agent_policy_assignments',
    });
  });

  it('classifies a missing enrolled total as undetermined', () => {
    expect(
      classifyPolicyUsage(
        countResult({
          source: 'fleet_status_aggregation',
          status: { online: 2 },
        })
      )
    ).toEqual({
      classification: 'undetermined',
      reason: 'no_enrolled_total',
    });
  });

  it('classifies a positive enrolled total as used', () => {
    expect(
      classifyPolicyUsage(
        countResult({
          source: 'fleet_status_aggregation',
          status: { all: 3, offline: 1 },
        })
      )
    ).toEqual({
      classification: 'used',
      enrolled: 3,
    });
  });

  it('classifies a zero enrolled total as unused', () => {
    expect(
      classifyPolicyUsage(
        countResult({
          source: 'fleet_status_aggregation',
          status: { all: 0 },
        })
      )
    ).toEqual({
      classification: 'unused',
      enrolled: 0,
    });
  });
});
