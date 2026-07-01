/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { AgentAccessControlMode, type CurrentUser } from '@kbn/agent-builder-common';

/**
 * Builds an Elasticsearch DSL filter that limits the visible agents for a non-admin user
 * to those they may at least see/list.
 *
 * A non-admin user can list an agent when any of the following holds:
 *   - the agent's access mode is not Private (Public + Shared cover the world by default), OR
 *   - the user is the agent's creator (matched on profile id and/or username), OR
 *   - the agent's access-control entries have a `type=user` entry naming the current user.
 *
 * V1: only user-type ACL entries are matched. Role-type grants land in V2 once the
 * upstream Elasticsearch role-listing change is in.
 */
export const buildReadAccessFilter = ({ user }: { user: CurrentUser }) => {
  const shouldClauses: Array<Record<string, unknown>> = [
    // Current documents: Public and Shared agents are visible to everyone; Private agents are not.
    {
      bool: {
        must: { exists: { field: 'access_control.access_mode' } },
        must_not: { term: { 'access_control.access_mode': AgentAccessControlMode.Private } },
      },
    },
    // Legacy documents: fall back to `visibility` only when `access_control.access_mode` is absent.
    // Missing legacy visibility is treated like Public, matching `normalizeAccessControl`.
    {
      bool: {
        must_not: [
          { exists: { field: 'access_control.access_mode' } },
          { term: { visibility: AgentAccessControlMode.Private } },
        ],
      },
    },
  ];

  shouldClauses.push({ term: { created_by_name: user.username } });
  if (user.id !== undefined) {
    shouldClauses.push({ term: { created_by_id: user.id } });
  }

  // Current explicit user grants.
  shouldClauses.push({
    nested: {
      path: 'access_control.entries',
      ignore_unmapped: true,
      query: {
        bool: {
          filter: [
            { term: { 'access_control.entries.type': 'user' } },
            { term: { 'access_control.entries.name': user.username } },
          ],
        },
      },
    },
  });

  // Legacy explicit user grants. The guard keeps stale `acl` data from overriding current
  // `access_control` on documents that have already been migrated.
  shouldClauses.push({
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
                { term: { 'acl.entries.name': user.username } },
              ],
            },
          },
        },
      },
    },
  });

  // Some legacy indices mapped `acl.entries` as a plain object rather than nested, so keep a
  // non-nested fallback for those documents too.
  shouldClauses.push({
    bool: {
      must_not: { exists: { field: 'access_control.access_mode' } },
      filter: [
        { term: { 'acl.entries.type': 'user' } },
        { term: { 'acl.entries.name': user.username } },
      ],
    },
  });

  return {
    bool: {
      should: shouldClauses,
      minimum_should_match: 1,
    },
  };
};
