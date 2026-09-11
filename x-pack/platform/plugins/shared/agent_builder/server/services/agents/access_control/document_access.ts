/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  AgentAccessControlMode,
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
  matchesAccessControlEntry,
} from './authorization';
import type { AgentProperties } from '../persisted/client/storage';

/**
 * Resolves access control from persisted agent documents.
 *
 * `access_control` is the current field. `visibility` and `acl` are legacy fields, and are only
 * used when the corresponding current field is missing so migrated documents keep current data as
 * the source of truth.
 *
 * Documents that predate both resolve to Public, not to the Private default applied to new agents.
 * Must stay in sync with the legacy clause of `buildReadAccessFilter` in `./query.ts`.
 */
export const normalizeAccessControl = (
  source: Pick<AgentProperties, 'access_control' | 'visibility' | 'acl'>
): AgentAccessControl => ({
  access_mode:
    source.access_control?.access_mode ?? source.visibility ?? AgentAccessControlMode.Public,
  entries: source.access_control?.entries ?? source.acl?.entries ?? [],
});

const sourceToOwner = (source: AgentProperties): UserIdAndName | undefined =>
  source.created_by_name !== undefined
    ? { id: source.created_by_id, username: source.created_by_name }
    : undefined;

export const hasReadAccess = ({
  source,
  user,
}: {
  source: AgentProperties;
  user: CurrentUser;
}): boolean =>
  hasAgentReadAccess({
    accessControl: normalizeAccessControl(source),
    owner: sourceToOwner(source),
    currentUser: user,
  });

export const hasUseAccess = ({
  source,
  user,
}: {
  source: AgentProperties;
  user: CurrentUser;
}): boolean =>
  hasAgentUseAccess({
    accessControl: normalizeAccessControl(source),
    owner: sourceToOwner(source),
    currentUser: user,
  });

export const hasWriteAccess = ({
  source,
  user,
}: {
  source: AgentProperties;
  user: CurrentUser;
}): boolean =>
  hasAgentWriteAccess({
    accessControl: normalizeAccessControl(source),
    owner: sourceToOwner(source),
    currentUser: user,
  });

export const hasDeleteAccess = ({
  source,
  user,
}: {
  source: AgentProperties;
  user: CurrentUser;
}): boolean =>
  canDeleteAgent({
    accessControl: normalizeAccessControl(source),
    owner: sourceToOwner(source),
    currentUser: user,
  });

export const hasManageAccessControlAccess = ({
  source,
  user,
}: {
  source: AgentProperties;
  user: CurrentUser;
}): boolean =>
  canChangeAgentAccessControl({
    agentId: source.id,
    accessControl: normalizeAccessControl(source),
    owner: sourceToOwner(source),
    currentUser: user,
  });

export const getAgentPermissions = ({
  source,
  user,
}: {
  source: AgentProperties;
  user: CurrentUser;
}): AgentPermissions => ({
  update_agent: hasWriteAccess({ source, user }),
  update_access_control: hasManageAccessControlAccess({ source, user }),
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
}: {
  definition: T;
  source: AgentProperties;
  user: CurrentUser;
}): T => {
  if (!definition.access_control || definition.access_control.entries.length === 0) {
    return definition;
  }
  const canManage = hasManageAccessControlAccess({ source, user });
  if (canManage) {
    return definition;
  }
  return {
    ...definition,
    access_control: {
      ...definition.access_control,
      entries: definition.access_control.entries.filter((entry) =>
        matchesAccessControlEntry(entry, user)
      ),
    },
  };
};

export const validateAccessControlUpdateAccess = ({
  source,
  update,
  user,
}: {
  source: AgentProperties;
  update: AgentUpdateRequest;
  user: CurrentUser;
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
    })
  );
};
