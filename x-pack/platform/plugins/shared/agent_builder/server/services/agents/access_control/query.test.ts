/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { AgentAccessControlMode } from '@kbn/agent-builder-common';
import { buildReadAccessFilter } from './query';

const ownerUser = { id: 'user-1', username: 'owner' };
const ownerByUsernameOnly = { username: 'owner' };

describe('buildReadAccessFilter', () => {
  it('includes owner clauses, the not-private access-control mode clause, and a nested user-ACL clause', () => {
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
          { term: { created_by_name: 'owner' } },
          { term: { created_by_id: 'user-1' } },
          {
            nested: {
              path: 'access_control.entries',
              ignore_unmapped: true,
              query: {
                bool: {
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
          {
            bool: {
              must_not: { exists: { field: 'access_control.access_mode' } },
              filter: [
                { term: { 'acl.entries.type': 'user' } },
                { term: { 'acl.entries.name': 'owner' } },
              ],
            },
          },
        ],
        minimum_should_match: 1,
      },
    });
  });

  it('omits created_by_id clause when user.id is undefined but still adds user-ACL nested clause', () => {
    const filter = buildReadAccessFilter({ user: ownerByUsernameOnly });
    expect(filter.bool.should).toHaveLength(6);
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
    expect(filter.bool.should[2]).toEqual({ term: { created_by_name: 'owner' } });
    expect(filter.bool.should[3]).toEqual({
      nested: {
        path: 'access_control.entries',
        ignore_unmapped: true,
        query: {
          bool: {
            filter: [
              { term: { 'access_control.entries.type': 'user' } },
              { term: { 'access_control.entries.name': 'owner' } },
            ],
          },
        },
      },
    });
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
    expect(types).toEqual(['user']);
  });
});
