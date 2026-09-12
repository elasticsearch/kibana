/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  buildUnitedRolloutStatusFilter,
  UNITED_ROLLOUT_STATUS_ASSIGNMENT_FIELD,
} from './united_rollout_status_filter';

describe('buildUnitedRolloutStatusFilter', () => {
  const ignoredAgentIds = [
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-1111-1111-111111111111',
  ];

  it('returns match_none when agentPolicyIds is empty', () => {
    expect(buildUnitedRolloutStatusFilter([])).toEqual({ match_none: {} });
  });

  it('admits exact assignment ids on the runtime membership field', () => {
    expect(buildUnitedRolloutStatusFilter(['base'])).toEqual({
      bool: {
        must_not: { terms: { 'agent.id': ignoredAgentIds } },
        filter: [
          { exists: { field: 'united.endpoint.agent.id' } },
          { exists: { field: 'united.agent.agent.id' } },
          { term: { 'united.agent.active': { value: true } } },
          { terms: { [UNITED_ROLLOUT_STATUS_ASSIGNMENT_FIELD]: ['base'] } },
        ],
      },
    });
  });

  it('deduplicates assignment ids and does not emit suffix wildcards', () => {
    const result = buildUnitedRolloutStatusFilter(['base', 'other', 'base']);

    expect(result).toEqual({
      bool: {
        must_not: { terms: { 'agent.id': ignoredAgentIds } },
        filter: [
          { exists: { field: 'united.endpoint.agent.id' } },
          { exists: { field: 'united.agent.agent.id' } },
          { term: { 'united.agent.active': { value: true } } },
          { terms: { [UNITED_ROLLOUT_STATUS_ASSIGNMENT_FIELD]: ['base', 'other'] } },
        ],
      },
    });
  });
});
