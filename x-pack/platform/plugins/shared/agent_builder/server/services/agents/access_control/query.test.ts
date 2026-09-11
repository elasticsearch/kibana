/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { AgentAccessControlMode } from '@kbn/agent-builder-common';
import { buildReadAccessFilter } from './query';

const ownerUser = { id: 'user-1', username: 'owner', isAdmin: false };
const ownerByUsernameOnly = { username: 'owner', isAdmin: false };

describe('buildReadAccessFilter', () => {
  it('includes owner id clause, legacy username ownership, the not-private access-control mode clause, an id-backed nested user-ACL clause, an id-less nested user-ACL fallback, and the legacy acl clause', () => {
    const filter = buildReadAccessFilter({ user: ownerUser });
    expect(filter).toEqual({
      bool: {
        should: [
          {
            bool: {
              must: { exists: { field: 'access_control.access_mode' } },
              must_not: { term: { 'access_control.access_mode': AgentAccessControlMode.Private } },
            },
          },
          {
            bool: {
              must_not: [
                { exists: { field: 'access_control.access_mode' } },
                { term: { visibility: AgentAccessControlMode.Private } },
              ],
            },
          },
          { term: { created_by_id: 'user-1' } },
          {
            bool: {
              must_not: { exists: { field: 'created_by_id' } },
              filter: { term: { created_by_name: 'owner' } },
            },
          },
          {
            nested: {
              path: 'access_control.entries',
              ignore_unmapped: true,
              query: {
                bool: {
                  filter: [
                    { term: { 'access_control.entries.type': 'user' } },
                    { term: { 'access_control.entries.id': 'user-1' } },
                  ],
                },
              },
            },
          },
          {
            nested: {
              path: 'access_control.entries',
              ignore_unmapped: true,
              query: {
                bool: {
                  must_not: { exists: { field: 'access_control.entries.id' } },
                  filter: [
                    { term: { 'access_control.entries.type': 'user' } },
                    { term: { 'access_control.entries.name': 'owner' } },
                  ],
                },
              },
            },
          },
          {
            bool: {
              must_not: { exists: { field: 'access_control.access_mode' } },
              filter: {
                nested: {
                  path: 'acl.entries',
                  ignore_unmapped: true,
                  query: {
                    bool: {
                      filter: [
                        { term: { 'acl.entries.type': 'user' } },
                        { term: { 'acl.entries.name': 'owner' } },
                      ],
                    },
                  },
                },
              },
            },
          },
        ],
        minimum_should_match: 1,
      },
    });
  });

  it('omits created_by_id and id-backed entry clauses when user.id is undefined but still adds legacy username, id-less entry, and user-ACL clauses', () => {
    const filter = buildReadAccessFilter({ user: ownerByUsernameOnly });
    // Public/Shared, legacy visibility, created_by_name, id-less entries, legacy acl.
    expect(filter.bool.should).toHaveLength(5);
    expect(filter.bool.should[0]).toEqual({
      bool: {
        must: { exists: { field: 'access_control.access_mode' } },
        must_not: { term: { 'access_control.access_mode': AgentAccessControlMode.Private } },
      },
    });
    expect(filter.bool.should[1]).toEqual({
      bool: {
        must_not: [
          { exists: { field: 'access_control.access_mode' } },
          { term: { visibility: AgentAccessControlMode.Private } },
        ],
      },
    });
    expect(filter.bool.should[2]).toEqual({
      bool: {
        must_not: { exists: { field: 'created_by_id' } },
        filter: { term: { created_by_name: 'owner' } },
      },
    });
    expect(filter.bool.should[3]).toEqual({
      nested: {
        path: 'access_control.entries',
        ignore_unmapped: true,
        query: {
          bool: {
            must_not: { exists: { field: 'access_control.entries.id' } },
            filter: [
              { term: { 'access_control.entries.type': 'user' } },
              { term: { 'access_control.entries.name': 'owner' } },
            ],
          },
        },
      },
    });
    expect(filter.bool.should).not.toContainEqual({ term: { created_by_name: 'owner' } });
    for (const clause of filter.bool.should) {
      const filters = (
        clause as {
          nested?: { query?: { bool?: { filter?: Array<{ term?: Record<string, string> }> } } };
        }
      ).nested?.query?.bool?.filter;
      const ids = (filters ?? []).map((f) => f.term?.['access_control.entries.id']).filter(Boolean);
      expect(ids).toHaveLength(0);
    }
  });

  it('only emits user-type access-control clauses (V1)', () => {
    const filter = buildReadAccessFilter({ user: ownerUser });
    const types = (
      filter.bool.should as Array<{
        nested?: { query?: { bool?: { filter?: Array<{ term?: Record<string, string> }> } } };
      }>
    )
      .flatMap((clause) => clause.nested?.query?.bool?.filter ?? [])
      .map((clauseFilter) => clauseFilter.term?.['access_control.entries.type'])
      .filter(Boolean);
    expect(types).toEqual(['user', 'user']);
  });
});
