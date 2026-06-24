/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  AgentAccessControlMode,
  getDefaultAgentAccessControl,
  type AgentAccessControl,
  type CurrentUser,
  type UserIdAndName,
} from '@kbn/agent-builder-common';
import type { AgentPermissions } from '../../../../common/http_api/agents';
import type { AgentUpdateRequest } from '../../../../common/agents';
import {
  canChangeAgentAccessControl,
  canDeleteAgent,
  hasAgentReadAccess,
  hasAgentUseAccess,
  hasAgentWriteAccess,
} from '.';
import type { AgentProperties } from '../persisted/client/storage';

/**
 * Resolves access control from persisted agent documents.
 *
 * `access_control` is the current field. `visibility` and `acl` are legacy fields, and are only
 * used when the corresponding current field is missing so migrated documents keep current data as
 * the source of truth.
 */
export const normalizeAccessControl = (
  source: Pick<AgentProperties, 'access_control' | 'visibility' | 'acl'>
): AgentAccessControl => {
  const defaults = getDefaultAgentAccessControl();
  return {
    access_mode: source.access_control?.access_mode ?? source.visibility ?? defaults.access_mode,
    entries: source.access_control?.entries ?? source.acl?.entries ?? defaults.entries,
  };
};

const sourceToOwner = (source: AgentProperties): UserIdAndName | undefined =>
  source.created_by_name !== undefined
    ? { id: source.created_by_id, username: source.created_by_name }
    : undefined;

export const hasReadAccess = ({
  source,
  user,
  isAdmin,
}: {
  source: AgentProperties;
  user: CurrentUser;
  isAdmin: boolean;
}): boolean =>
  hasAgentReadAccess({
    accessControl: normalizeAccessControl(source),
    owner: sourceToOwner(source),
    currentUser: user,
    isAdmin,
  });

export const hasUseAccess = ({
  source,
  user,
  isAdmin,
}: {
  source: AgentProperties;
  user: CurrentUser;
  isAdmin: boolean;
}): boolean =>
  hasAgentUseAccess({
    accessControl: normalizeAccessControl(source),
    owner: sourceToOwner(source),
    currentUser: user,
    isAdmin,
  });

export const hasWriteAccess = ({
  source,
  user,
  isAdmin,
}: {
  source: AgentProperties;
  user: CurrentUser;
  isAdmin: boolean;
}): boolean =>
  hasAgentWriteAccess({
    accessControl: normalizeAccessControl(source),
    owner: sourceToOwner(source),
    currentUser: user,
    isAdmin,
  });

export const hasDeleteAccess = ({
  source,
  user,
  isAdmin,
}: {
  source: AgentProperties;
  user: CurrentUser;
  isAdmin: boolean;
}): boolean =>
  canDeleteAgent({
    accessControl: normalizeAccessControl(source),
    owner: sourceToOwner(source),
    currentUser: user,
    isAdmin,
  });

export const hasManageAccessControlAccess = ({
  source,
  user,
  isAdmin,
}: {
  source: AgentProperties;
  user: CurrentUser;
  isAdmin: boolean;
}): boolean =>
  canChangeAgentAccessControl({
    agentId: source.id,
    accessControl: normalizeAccessControl(source),
    owner: sourceToOwner(source),
    currentUser: user,
    isAdmin,
  });

export const getAgentPermissions = ({
  source,
  user,
  isAdmin,
}: {
  source: AgentProperties;
  user: CurrentUser;
  isAdmin: boolean;
}): AgentPermissions => ({
  update_agent: hasWriteAccess({ source, user, isAdmin }),
  update_access_control: hasManageAccessControlAccess({ source, user, isAdmin }),
});

/**
 * Redacts `access_control.entries` from a returned agent definition when the caller is not allowed
 * to manage the agent access control. The caller's own entry is retained so the client can still
 * evaluate non-management permissions such as Editor-level write access.
 */
export const redactAccessControlForCaller = <T extends { access_control?: AgentAccessControl }>({
  definition,
  source,
  user,
  isAdmin,
}: {
  definition: T;
  source: AgentProperties;
  user: CurrentUser;
  isAdmin: boolean;
}): T => {
  if (!definition.access_control || definition.access_control.entries.length === 0) {
    return definition;
  }
  const canManage = hasManageAccessControlAccess({ source, user, isAdmin });
  if (canManage) {
    return definition;
  }
  return {
    ...definition,
    access_control: {
      ...definition.access_control,
      entries: definition.access_control.entries.filter(
        (entry) => entry.type === 'user' && user.username && entry.name === user.username
      ),
    },
  };
};

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

/**
 * Backwards-compatible alias. Prefer {@link buildReadAccessFilter} for new code.
 * @deprecated
 */
export const buildAccessControlReadFilter = buildReadAccessFilter;

export const validateAccessControlUpdateAccess = ({
  source,
  update,
  user,
  isAdmin,
}: {
  source: AgentProperties;
  update: AgentUpdateRequest;
  user: CurrentUser;
  isAdmin: boolean;
}): boolean => {
  const currentAccessControl = normalizeAccessControl(source);
  const currentAccessMode = currentAccessControl.access_mode;
  const nextAccessMode = update.access_control?.access_mode;
  const isAccessModeChange = nextAccessMode !== undefined && nextAccessMode !== currentAccessMode;

  return (
    !isAccessModeChange ||
    canChangeAgentAccessControl({
      agentId: source.id,
      accessControl: currentAccessControl,
      owner: sourceToOwner(source),
      currentUser: user,
      isAdmin,
    })
  );
};
