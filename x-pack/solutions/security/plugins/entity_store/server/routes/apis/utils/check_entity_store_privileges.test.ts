/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getMissingPrivileges } from './check_entity_store_privileges';
import type { CheckPrivilegesResponse } from '@kbn/security-plugin-types-server';

function createMockPrivilegesResponse(
  overrides?: Partial<CheckPrivilegesResponse>
): CheckPrivilegesResponse {
  return {
    hasAllRequested: true,
    privileges: {
      kibana: [
        { privilege: 'kibana:create', authorized: true },
        { privilege: 'kibana:read', authorized: false },
      ],
      elasticsearch: {
        cluster: [
          { privilege: 'cluster:monitor', authorized: true },
          { privilege: 'cluster:manage', authorized: false },
        ],
        index: {
          'logs-*': [
            { privilege: 'read', authorized: true },
            { privilege: 'write', authorized: false },
          ],
          'metrics-*': [{ privilege: 'read', authorized: true }],
        },
      },
    },
    username: 'test-user',
    ...overrides,
  };
}

describe('getMissingPrivileges', () => {
  it('returns missing kibana privileges when some are unauthorized', () => {
    const response = createMockPrivilegesResponse();
    const result = getMissingPrivileges(response);

    expect(result.missing_kibana_privileges).toEqual(['kibana:read']);
  });

  it('returns missing elasticsearch cluster privileges when some are unauthorized', () => {
    const response = createMockPrivilegesResponse();
    const result = getMissingPrivileges(response);

    expect(result.missing_elasticsearch_privileges.cluster).toEqual(['cluster:manage']);
  });

  it('returns missing elasticsearch index privileges only for indices with unauthorized privileges', () => {
    const response = createMockPrivilegesResponse();
    const result = getMissingPrivileges(response);

    expect(result.missing_elasticsearch_privileges.index).toEqual([
      { index: 'logs-*', privileges: ['write'] },
    ]);
  });

  it('returns empty arrays when all privileges are authorized', () => {
    const response = createMockPrivilegesResponse({
      privileges: {
        kibana: [{ privilege: 'kibana:create', authorized: true }],
        elasticsearch: {
          cluster: [{ privilege: 'cluster:monitor', authorized: true }],
          index: {
            'logs-*': [{ privilege: 'read', authorized: true }],
          },
        },
      },
    });
    const result = getMissingPrivileges(response);

    expect(result.missing_kibana_privileges).toEqual([]);
    expect(result.missing_elasticsearch_privileges.cluster).toEqual([]);
    expect(result.missing_elasticsearch_privileges.index).toEqual([]);
  });
});
